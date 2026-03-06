/**
 * @description خدمة استخراج النصوص من ملفات DOC عبر antiword
 */

import process from "node:process";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import {
  ExecFileClassifiedError,
  classifyExecError,
} from "../exec-file-error-classifier.mjs";
import { normalizeIncomingText } from "./text-normalizer.mjs";
import { cleanExtractedDocText } from "./text-normalizer.mjs";

const DOC_CONVERTER_TIMEOUT_MS = 30_000;
const DOC_CONVERTER_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_ANTIWORD_PATH = "antiword";
const DEFAULT_ANTIWORD_HOME = "/usr/share/antiword";

export { DEFAULT_ANTIWORD_PATH, DEFAULT_ANTIWORD_HOME };

const toExecBuffer = (value) =>
  Buffer.isBuffer(value) ? value : Buffer.from(value ?? "", "utf-8");

const decodeUtf8Buffer = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder("utf-8").decode(value);
};

export const resolveAntiwordRuntime = () => {
  const antiwordPath =
    process.env.ANTIWORD_PATH?.trim() || DEFAULT_ANTIWORD_PATH;
  const antiwordHome =
    process.env.ANTIWORDHOME?.trim() || DEFAULT_ANTIWORD_HOME;

  return {
    antiwordPath,
    antiwordHome,
    runtimeSource: process.env.ANTIWORD_PATH?.trim() ? "env" : "path-default",
  };
};

export const runAntiwordPreflight = () => {
  const runtime = resolveAntiwordRuntime();
  const warnings = [];
  let binaryAvailable = false;

  try {
    execFileSync(runtime.antiwordPath, ["-h"], {
      stdio: "pipe",
      timeout: 5000,
      windowsHide: true,
      env: {
        ...process.env,
        ANTIWORDHOME: runtime.antiwordHome,
      },
    });
    binaryAvailable = true;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "ENOENT") {
      warnings.push(
        `antiword binary غير موجود على المسار الحالي: ${runtime.antiwordPath}`
      );
    } else if (code === "EACCES") {
      warnings.push(
        `antiword binary موجود لكنه غير قابل للتنفيذ: ${runtime.antiwordPath}`
      );
    } else {
      // antiword قد يرجع exit code غير صفري مع -h رغم وجوده.
      binaryAvailable = true;
    }
  }

  const antiwordHomeExists = existsSync(runtime.antiwordHome);
  if (!antiwordHomeExists) {
    warnings.push(
      `ANTIWORDHOME غير موجود أو غير صحيح: ${runtime.antiwordHome}`
    );
  }

  return {
    ...runtime,
    binaryAvailable,
    antiwordHomeExists,
    warnings,
  };
};

const runAntiword = async (antiwordPath, args, antiwordHome) =>
  new Promise((resolve, reject) => {
    execFile(
      antiwordPath,
      args,
      {
        encoding: "buffer",
        timeout: DOC_CONVERTER_TIMEOUT_MS,
        maxBuffer: DOC_CONVERTER_MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          ANTIWORDHOME: antiwordHome,
        },
      },
      (error, stdout, stderr) => {
        const stdoutBuffer = toExecBuffer(stdout);
        const stderrBuffer = toExecBuffer(stderr);

        if (error) {
          reject(
            classifyExecError(
              error,
              "antiword",
              DOC_CONVERTER_TIMEOUT_MS,
              stdoutBuffer,
              stderrBuffer
            )
          );
          return;
        }

        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
      }
    );
  });

const resolveTempFilename = (filename) => {
  const base = basename(filename || "document.doc");
  const hscene_header_3ocExt = extname(base).toLowerCase() === ".doc";
  return hscene_header_3ocExt ? base : `${base}.doc`;
};

export const convertDocBufferToText = async (buffer, filename) => {
  const warnings = [];
  const attempts = ["doc-converter-flow"];
  const runtime = resolveAntiwordRuntime();
  let tempDirPath = null;

  try {
    tempDirPath = await mkdtemp(join(tmpdir(), "doc-converter-flow-"));
    const tempFilePath = join(tempDirPath, resolveTempFilename(filename));
    await writeFile(tempFilePath, buffer);

    const { stdout, stderr } = await runAntiword(
      runtime.antiwordPath,
      ["-m", "UTF-8.txt", "-w", "0", tempFilePath],
      runtime.antiwordHome
    );

    const stderrText = decodeUtf8Buffer(stderr).trim();
    if (stderrText) warnings.push(stderrText);

    const decoded = decodeUtf8Buffer(stdout);
    const cleaned = cleanExtractedDocText(decoded);
    if (!cleaned) {
      throw new Error("antiword أعاد نصًا فارغًا");
    }

    return {
      text: cleaned,
      method: "doc-converter-flow",
      usedOcr: false,
      attempts,
      warnings,
      antiword: runtime,
    };
  } catch (error) {
    if (error instanceof ExecFileClassifiedError) {
      const stderrText = normalizeIncomingText(
        error.classifiedError?.stderrPreview,
        400
      );
      if (stderrText) warnings.push(stderrText);
      throw new ExecFileClassifiedError(
        `فشل تحويل ملف DOC عبر antiword (${runtime.antiwordPath}): ${error.message}`,
        {
          statusCode: error.statusCode,
          category: error.category,
          classifiedError: {
            ...error.classifiedError,
            antiwordPath: runtime.antiwordPath,
            antiwordHome: runtime.antiwordHome,
          },
        }
      );
    }
    throw new Error(
      `فشل تحويل ملف DOC عبر antiword (${runtime.antiwordPath}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        cause: error,
      }
    );
  } finally {
    if (tempDirPath) {
      await rm(tempDirPath, { recursive: true, force: true }).catch(() => {});
    }
  }
};

export const decodeUtf8Fallback = (buffer) => {
  const utf8Text = buffer.toString("utf8");
  const hasReplacementChars =
    utf8Text.includes("\uFFFD") || utf8Text.includes("�");
  if (!hasReplacementChars) return utf8Text;
  return buffer.toString("latin1");
};
