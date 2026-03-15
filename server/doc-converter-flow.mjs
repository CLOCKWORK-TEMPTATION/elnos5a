import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

const DOC_CONVERTER_TIMEOUT_MS = 30_000;
const DOC_CONVERTER_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_ANTIWORD_PATH = "antiword";
const DEFAULT_ANTIWORD_HOME = "/usr/share/antiword";

const normalizeNewlines = (value) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

const decodeUtf8Buffer = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder("utf-8").decode(value);
};

const stripAsciiControlChars = (value) => {
  const text = String(value ?? "");
  let cleaned = "";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    const isBlocked =
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f;
    if (!isBlocked) cleaned += ch;
  }

  return cleaned;
};

const cleanExtractedText = (text) =>
  stripAsciiControlChars(normalizeNewlines(text))
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const resolveAntiwordRuntime = () => {
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
        const stdoutBuffer = Buffer.isBuffer(stdout)
          ? stdout
          : Buffer.from(stdout ?? "", "utf-8");
        const stderrBuffer = Buffer.isBuffer(stderr)
          ? stderr
          : Buffer.from(stderr ?? "", "utf-8");

        if (error) {
          const wrappedError = error;
          wrappedError.stdout = stdoutBuffer;
          wrappedError.stderr = stderrBuffer;
          reject(wrappedError);
          return;
        }

        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
      }
    );
  });

const resolveTempFilename = (filename) => {
  const base = basename(filename || "document.doc");
  const hasDocExt = extname(base).toLowerCase() === ".doc";
  return hasDocExt ? base : `${base}.doc`;
};

export const convertDocBufferToText = async (buffer, filename) => {
  const warnings = [];
  const attempts = ["doc-converter-flow"];
  const runtime = resolveAntiwordRuntime();
  const attemptedPaths = [runtime.antiwordPath];

  let tempDirPath = null;
  const startedAt = Date.now();

  try {
    tempDirPath = await mkdtemp(join(tmpdir(), "doc-converter-flow-"));
    const tempFilePath = join(tempDirPath, resolveTempFilename(filename));
    await writeFile(tempFilePath, buffer);

    const args = ["-m", "UTF-8.txt", "-w", "0", tempFilePath];
    const { stdout, stderr } = await runAntiword(
      runtime.antiwordPath,
      args,
      runtime.antiwordHome
    );

    const stderrText = decodeUtf8Buffer(stderr).trim();
    if (stderrText) {
      warnings.push(stderrText);
    }

    const decodedText = decodeUtf8Buffer(stdout);
    const cleanedText = cleanExtractedText(decodedText);
    if (!cleanedText) {
      throw new Error("antiword أعاد نصًا فارغًا");
    }

    // eslint-disable-next-line no-console
    console.info("[doc-converter-flow] success", {
      resolvedAntiwordPath: runtime.antiwordPath,
      resolvedAntiwordHome: runtime.antiwordHome,
      runtimeSource: runtime.runtimeSource,
      durationMs: Date.now() - startedAt,
      textLength: cleanedText.length,
    });

    return {
      text: cleanedText,
      method: "doc-converter-flow",
      warnings,
      attempts,
    };
  } catch (error) {
    const stderrText = decodeUtf8Buffer(error?.stderr).trim();
    if (stderrText) {
      warnings.push(stderrText);
    }

    console.error("[doc-converter-flow] failed", {
      resolvedAntiwordPath: runtime.antiwordPath,
      resolvedAntiwordHome: runtime.antiwordHome,
      runtimeSource: runtime.runtimeSource,
      attemptedPaths,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new Error("فشل تحويل ملف .doc عبر doc-converter-flow", {
      cause: error,
    });
  } finally {
    if (tempDirPath) {
      await rm(tempDirPath, { recursive: true, force: true }).catch(() => {
        // best effort cleanup
      });
    }
  }
};
