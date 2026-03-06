/**
 * @description متحكم استخراج النصوص من الملفات
 */

import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecFileClassifiedError } from "../exec-file-error-classifier.mjs";
import { runPdfOcrAgent } from "../pdf-ocr-agent-runner.mjs";
import {
  sendJson,
  readRawBody,
  RequestValidationError,
  isHttpTypedError,
  extractErrorCode,
} from "../utils/http-helpers.mjs";
import { normalizeText } from "../services/text-normalizer.mjs";
import { parseExtractRequest } from "../services/request-parser.mjs";
import { normalizeExtractionResponseData } from "../services/response-normalizer.mjs";
import {
  convertDocBufferToText,
  decodeUtf8Fallback,
  runAntiwordPreflight,
} from "../services/doc-extractor.mjs";
import {
  convertDocxBufferToDocThenExtract,
  DOCX_TO_DOC_SCRIPT_EXISTS,
  DOCX_TO_DOC_SCRIPT_PATH,
} from "../services/docx-extractor.mjs";
import * as karankBridge from "../karank-bridge.mjs";

const ANTIWORD_PREFLIGHT = runAntiwordPreflight();

export { ANTIWORD_PREFLIGHT };

/**
 * تمرير النص المُستخرج عبر محرك karank للتصنيف
 * @param {string} extractedText - النص المُستخرج
 * @param {object} baseResult - نتيجة الاستخراج الأساسية
 * @returns {Promise<object>} نتيجة مُعززة بناتج المحرك
 */
const enrichWithEngine = async (extractedText, baseResult) => {
  try {
    const engineResult = await karankBridge.parseText(extractedText);
    return {
      ...baseResult,
      text:
        engineResult.schemaText || engineResult.schema_text || baseResult.text,
      method: "karank-engine-bridge",
      attempts: [...(baseResult.attempts || []), "karank-engine-bridge"],
      schemaText: engineResult.schemaText || engineResult.schema_text,
      schemaElements:
        engineResult.schemaElements || engineResult.schema_elements,
      rawExtractedText: extractedText,
    };
  } catch (engineError) {
    console.warn(
      "[extract-controller] فشل المحرك، استخدام الاستخراج العادي:",
      engineError.message
    );
    return baseResult;
  }
};

const extractByType = async (buffer, extension, filename) => {
  if (extension === "pdf") {
    const ocrResult = await runPdfOcrAgent({ buffer, filename });
    const text = typeof ocrResult.text === "string" ? ocrResult.text : "";
    if (text.trim()) {
      return enrichWithEngine(text, ocrResult);
    }
    return ocrResult;
  }

  if (extension === "txt" || extension === "fountain" || extension === "fdx") {
    const text = normalizeText(decodeUtf8Fallback(buffer));
    const baseResult = {
      text,
      method: "native-text",
      usedOcr: false,
      attempts: ["native-text"],
      warnings: [],
    };
    if (text.trim()) {
      return enrichWithEngine(text, baseResult);
    }
    return baseResult;
  }

  if (extension === "doc") {
    if (!ANTIWORD_PREFLIGHT.binaryAvailable) {
      throw new ExecFileClassifiedError(
        "تعذر استخراج DOC: antiword غير متاح. راجع health endpoint والتأكد من ANTIWORD_PATH.",
        {
          statusCode: 422,
          category: "binary-missing",
          classifiedError: {
            category: "binary-missing",
            antiwordPath: ANTIWORD_PREFLIGHT.antiwordPath,
          },
        }
      );
    }
    if (!ANTIWORD_PREFLIGHT.antiwordHomeExists) {
      throw new ExecFileClassifiedError(
        `تعذر استخراج DOC: مسار ANTIWORDHOME غير صالح (${ANTIWORD_PREFLIGHT.antiwordHome}).`,
        {
          statusCode: 422,
          category: "invalid-config",
          classifiedError: {
            category: "invalid-config",
            antiwordHome: ANTIWORD_PREFLIGHT.antiwordHome,
          },
        }
      );
    }
    const docResult = await convertDocBufferToText(buffer, filename);
    const docText = typeof docResult.text === "string" ? docResult.text : "";
    if (docText.trim()) {
      return enrichWithEngine(docText, docResult);
    }
    return docResult;
  }

  if (extension === "docx") {
    // مسار المحرك المباشر: حفظ مؤقت ثم parseDocx
    const tempPath = join(
      tmpdir(),
      `karank-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`
    );
    try {
      await writeFile(tempPath, buffer);
      const engineResult = await karankBridge.parseDocx(tempPath);
      const schemaText =
        engineResult.schemaText || engineResult.schema_text || "";
      const rawText = engineResult.input?.text_length
        ? "" // النص الخام غير متاح مباشرة من parseDocx, سنستخدم schema
        : "";

      return {
        text: schemaText,
        method: "karank-engine-bridge",
        usedOcr: false,
        attempts: ["karank-engine-bridge"],
        warnings: [],
        schemaText,
        schemaElements:
          engineResult.schemaElements || engineResult.schema_elements,
        rawExtractedText: rawText,
      };
    } catch (engineError) {
      console.warn(
        "[extract-controller] فشل المحرك مع DOCX، محاولة الطريقة التقليدية:",
        engineError.message
      );
      // fallback للطريقة التقليدية
      if (!DOCX_TO_DOC_SCRIPT_EXISTS) {
        throw new ExecFileClassifiedError(
          "تعذر استخراج DOCX: ملف المحول غير موجود (docx-to-doc.final.ts).",
          {
            statusCode: 422,
            category: "invalid-config",
            classifiedError: {
              category: "invalid-config",
              converterScript: DOCX_TO_DOC_SCRIPT_PATH,
            },
          }
        );
      }
      if (!ANTIWORD_PREFLIGHT.binaryAvailable) {
        throw new ExecFileClassifiedError(
          "تعذر استخراج DOCX: antiword غير متاح.",
          {
            statusCode: 422,
            category: "binary-missing",
            classifiedError: {
              category: "binary-missing",
              antiwordPath: ANTIWORD_PREFLIGHT.antiwordPath,
            },
          }
        );
      }
      if (!ANTIWORD_PREFLIGHT.antiwordHomeExists) {
        throw new ExecFileClassifiedError(
          `تعذر استخراج DOCX: مسار ANTIWORDHOME غير صالح (${ANTIWORD_PREFLIGHT.antiwordHome}).`,
          {
            statusCode: 422,
            category: "invalid-config",
            classifiedError: {
              category: "invalid-config",
              antiwordHome: ANTIWORD_PREFLIGHT.antiwordHome,
            },
          }
        );
      }
      return convertDocxBufferToDocThenExtract(buffer, filename);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  throw new Error(`Unsupported extension: ${extension}`);
};

export const handleExtract = async (req, res) => {
  try {
    const { filename, extension, buffer } = await parseExtractRequest(
      req,
      readRawBody
    );
    const extracted = await extractByType(buffer, extension, filename);
    const normalizedData = normalizeExtractionResponseData(
      extracted,
      extension
    );

    sendJson(res, 200, {
      success: true,
      data: normalizedData,
      meta: {
        filename,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    const statusCode = isHttpTypedError(error)
      ? error.statusCode
      : error instanceof RequestValidationError
        ? error.statusCode
        : 500;
    const errorCode = extractErrorCode(error, message);
    const payload = {
      success: false,
      error: message,
      ...(errorCode ? { errorCode } : {}),
    };
    if (error instanceof ExecFileClassifiedError) {
      payload.classifiedError = error.classifiedError;
    }
    sendJson(res, statusCode, payload);
  }
};
