/**
 * @description خدمة استخراج النصوص من ملفات DOCX عبر Mammoth مباشرةً ثم fallback إلى DOC/antiword عند الحاجة
 */

import process from "node:process";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";
import {
  ExecFileClassifiedError,
  classifyExecError,
} from "../exec-file-error-classifier.mjs";
import {
  cleanExtractedDocText,
  normalizeIncomingText,
} from "./text-normalizer.mjs";
import { convertDocBufferToText } from "./doc-extractor.mjs";

const DOCX_TO_DOC_CONVERTER_TIMEOUT_MS = 90_000;
const DOC_CONVERTER_MAX_BUFFER = 64 * 1024 * 1024;

export const DOCX_TO_DOC_SCRIPT_PATH = fileURLToPath(
  new URL("../docx-to-doc.final.ts", import.meta.url)
);
export const DOCX_TO_DOC_SCRIPT_EXISTS = existsSync(DOCX_TO_DOC_SCRIPT_PATH);

const toExecBuffer = (value) =>
  Buffer.isBuffer(value) ? value : Buffer.from(value ?? "", "utf-8");

const decodeUtf8Buffer = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder("utf-8").decode(value);
};

const normalizeMammothWarnings = (messages) =>
  Array.isArray(messages)
    ? messages
        .map((entry) => {
          if (!entry || typeof entry !== "object") return "";
          return normalizeIncomingText(entry.message, 400);
        })
        .filter(Boolean)
    : [];

const resolveDocxTempFilename = (filename) => {
  const base = basename(filename || "document.docx");
  const hscene_header_3ocxExt = extname(base).toLowerCase() === ".docx";
  if (hscene_header_3ocxExt) return base;
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return `${withoutExt || "document"}.docx`;
};

const runDocxToDocConverter = async (inputDocxPath, outputDocPath) =>
  new Promise((resolve, reject) => {
    const args = [
      "--import",
      "tsx",
      DOCX_TO_DOC_SCRIPT_PATH,
      inputDocxPath,
      outputDocPath,
      "--overwrite",
    ];

    execFile(
      process.execPath,
      args,
      {
        encoding: "buffer",
        timeout: DOCX_TO_DOC_CONVERTER_TIMEOUT_MS,
        maxBuffer: DOC_CONVERTER_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const stdoutBuffer = toExecBuffer(stdout);
        const stderrBuffer = toExecBuffer(stderr);

        if (error) {
          reject(
            classifyExecError(
              error,
              "docx-to-doc.final.ts",
              DOCX_TO_DOC_CONVERTER_TIMEOUT_MS,
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

export const convertDocxBufferToTextWithMammoth = async (buffer, filename) => {
  const normalizedBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer ?? "");

  const result = await mammoth.extractRawText({ buffer: normalizedBuffer });
  const text = cleanExtractedDocText(result.value ?? "");

  if (!text) {
    throw new Error(
      `تعذر استخراج نص DOCX مباشرةً من الملف: ${filename || "document.docx"}`
    );
  }

  return {
    text,
    method: "mammoth",
    usedOcr: false,
    attempts: ["mammoth-direct"],
    warnings: normalizeMammothWarnings(result.messages),
    normalizationApplied: ["docx-mammoth-extract"],
  };
};

export const convertDocxBufferToDocThenExtract = async (buffer, filename) => {
  const warnings = [];
  const attempts = ["docx-to-doc.final", "doc-converter-flow"];
  let tempDirPath = null;

  try {
    tempDirPath = await mkdtemp(join(tmpdir(), "docx-to-doc-flow-"));
    const sourceDocxPath = join(tempDirPath, resolveDocxTempFilename(filename));
    const convertedDocPath = sourceDocxPath.replace(/\.docx$/i, ".doc");

    await writeFile(sourceDocxPath, buffer);
    const { stdout, stderr } = await runDocxToDocConverter(
      sourceDocxPath,
      convertedDocPath
    );

    const converterStdout = decodeUtf8Buffer(stdout).trim();
    const converterStderr = decodeUtf8Buffer(stderr).trim();
    if (converterStdout) warnings.push(converterStdout);
    if (converterStderr) warnings.push(converterStderr);

    if (!existsSync(convertedDocPath)) {
      throw new Error(
        `تم تشغيل محول DOCX لكن ملف DOC الناتج غير موجود: ${convertedDocPath}`
      );
    }

    const convertedDocBuffer = await readFile(convertedDocPath);
    const extractedDoc = await convertDocBufferToText(
      convertedDocBuffer,
      basename(convertedDocPath)
    );

    return {
      ...extractedDoc,
      method: "doc-converter-flow",
      attempts: [...attempts, ...extractedDoc.attempts],
      warnings: [...warnings, ...extractedDoc.warnings],
    };
  } catch (error) {
    if (error instanceof ExecFileClassifiedError) {
      const stdoutText = normalizeIncomingText(
        error.classifiedError?.stdoutPreview,
        400
      );
      const stderrText = normalizeIncomingText(
        error.classifiedError?.stderrPreview,
        400
      );
      if (stdoutText) warnings.push(stdoutText);
      if (stderrText) warnings.push(stderrText);
      throw new ExecFileClassifiedError(
        `فشل مسار تحويل DOCX→DOC عبر docx-to-doc.final.ts: ${error.message}${
          warnings.length > 0 ? ` | logs: ${warnings.join(" | ")}` : ""
        }`,
        {
          statusCode: error.statusCode,
          category: error.category,
          classifiedError: {
            ...error.classifiedError,
            converterScript: DOCX_TO_DOC_SCRIPT_PATH,
          },
        }
      );
    }

    throw new Error(
      `فشل مسار تحويل DOCX→DOC عبر docx-to-doc.final.ts: ${
        error instanceof Error ? error.message : String(error)
      }${warnings.length > 0 ? ` | logs: ${warnings.join(" | ")}` : ""}`,
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
