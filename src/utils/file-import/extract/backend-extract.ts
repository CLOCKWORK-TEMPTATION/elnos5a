/**
 * @module utils/file-import/extract/backend-extract
 * @description استخراج النصوص عبر خادم Backend خارجي (REST API).
 *
 * يُرسل الملف بصيغة Base64 داخل جسم JSON إلى نقطة النهاية المحددة في
 * `VITE_FILE_IMPORT_BACKEND_URL`، مع مهلة زمنية افتراضية 45 ثانية
 * عبر {@link AbortController}.
 *
 * يُستخدم كبديل احتياطي (fallback) عندما يفشل الاستخراج في المتصفح
 * أو عندما يكون النوع غير مدعوم داخل المتصفح.
 */
import type {
  FileExtractionResponse,
  FileExtractionResult,
  ExtractionMethod,
  ImportedFileType,
} from "../../../types/file-import";

/** نقطة نهاية Backend المأخوذة من متغير البيئة */
const DEV_DEFAULT_BACKEND_ENDPOINT = "http://127.0.0.1:8787/api/file-extract";
const ENV_BACKEND_ENDPOINT =
  (
    process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
  )?.trim() ||
  (process.env.NODE_ENV === "development" ? DEV_DEFAULT_BACKEND_ENDPOINT : "");

const EXTRACTION_METHODS = new Set<ExtractionMethod>([
  "native-text",
  "mammoth",
  "doc-converter-flow",
  "ocr-mistral",
  "backend-api",
  "app-payload",
  "karank-engine-bridge",
]);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isExtractionMethod = (value: unknown): value is ExtractionMethod =>
  typeof value === "string" &&
  EXTRACTION_METHODS.has(value as ExtractionMethod);

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

/**
 * يحوّل ArrayBuffer إلى سلسلة Base64 عبر تقطيع القطع (chunks)
 * لتجنب تجاوز حد المكدس في `String.fromCharCode`.
 *
 * @param arrayBuffer - المخزن المؤقت المراد ترميزه
 * @returns سلسلة Base64
 */
const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  const runtimeBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          input: string,
          encoding: string
        ) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;

  if (runtimeBuffer) {
    return runtimeBuffer.from(binary, "binary").toString("base64");
  }

  throw new Error("No base64 encoder is available in the current runtime.");
};

/** يزيل الشرطة المائلة الزائدة من نهاية عنوان URL */
const normalizeEndpoint = (endpoint: string): string =>
  endpoint.replace(/\/$/, "");

const resolveBackendHealthEndpoint = (extractEndpoint: string): string => {
  const normalized = normalizeEndpoint(extractEndpoint);
  if (normalized.endsWith("/api/file-extract")) {
    return `${normalized.slice(0, -"/api/file-extract".length)}/health`;
  }
  if (normalized.endsWith("/api/files/extract")) {
    return `${normalized.slice(0, -"/api/files/extract".length)}/health`;
  }
  return `${normalized}/health`;
};

/**
 * خيارات استخراج الملف عبر Backend.
 * @property endpoint - عنوان URL مخصص (يتجاوز متغير البيئة)
 * @property timeoutMs - مهلة الطلب بالمللي ثانية (الافتراضي: 45000)
 */
export interface BackendExtractOptions {
  endpoint?: string;
  timeoutMs?: number;
}

export interface BackendPdfOcrReadiness {
  ready: boolean;
  healthEndpoint: string;
  ocrConfigured?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * يتحقق ممّا إذا كان Backend مضبوطاً (عبر متغير البيئة أو endpoint صريح).
 *
 * @param endpoint - عنوان اختياري يتجاوز `VITE_FILE_IMPORT_BACKEND_URL`
 * @returns `true` إذا وُجد عنوان غير فارغ
 */
export const isBackendExtractionConfigured = (endpoint?: string): boolean =>
  Boolean((endpoint ?? ENV_BACKEND_ENDPOINT).trim());

/**
 * يحلّ عنوان نقطة النهاية النهائي، ويرمي خطأ إذا لم يُضبط أي عنوان.
 * @throws {Error} إذا لم يكن هناك endpoint مضبوط
 */
const resolveBackendExtractionEndpoint = (endpoint?: string): string => {
  const resolved = (endpoint ?? ENV_BACKEND_ENDPOINT).trim();
  if (!resolved) {
    throw new Error(
      "VITE_FILE_IMPORT_BACKEND_URL غير مضبوط. اضبط endpoint كامل مثل: http://127.0.0.1:8787/api/file-extract"
    );
  }

  return normalizeEndpoint(resolved);
};

const parseBackendExtractionResult = (
  fileType: ImportedFileType,
  body: FileExtractionResponse
): FileExtractionResult => {
  if (!body.success || !body.data) {
    const code = toNonEmptyString(body.errorCode);
    const message =
      toNonEmptyString(body.error) ||
      "Backend extraction failed without details.";
    const fullMessage = code ? `${message} [${code}]` : message;
    const extractionError = createErrorWithCause(fullMessage, {
      errorCode: code,
    }) as Error & { errorCode?: string };
    if (code) {
      extractionError.errorCode = code;
    }
    throw extractionError;
  }

  const data = body.data;
  if (!isObjectRecord(data)) {
    throw new Error("Backend extraction response has invalid shape.");
  }
  if (typeof data.text !== "string") {
    throw new Error("Backend extraction response is missing text field.");
  }
  if (!isStringArray(data.warnings ?? [])) {
    throw new Error("Backend extraction response has invalid warnings field.");
  }
  if (!isStringArray(data.attempts ?? [])) {
    throw new Error("Backend extraction response has invalid attempts field.");
  }
  if (!isExtractionMethod(data.method ?? "backend-api")) {
    throw new Error(
      `Backend extraction response returned unknown method: ${String(data.method)}`
    );
  }
  if (typeof data.usedOcr !== "boolean") {
    throw new Error("Backend extraction response has invalid usedOcr field.");
  }

  const qualityScore =
    typeof data.qualityScore === "number" && Number.isFinite(data.qualityScore)
      ? data.qualityScore
      : undefined;

  const normalizationApplied =
    Array.isArray(data.normalizationApplied) &&
    data.normalizationApplied.every((entry) => typeof entry === "string")
      ? data.normalizationApplied
      : undefined;

  const structuredBlocks =
    Array.isArray(data.structuredBlocks) &&
    data.structuredBlocks.every(
      (block) =>
        block &&
        typeof block.formatId === "string" &&
        typeof block.text === "string"
    )
      ? data.structuredBlocks
      : undefined;

  const payloadVersion =
    typeof data.payloadVersion === "number" &&
    Number.isInteger(data.payloadVersion)
      ? data.payloadVersion
      : undefined;

  return {
    ...data,
    fileType,
    method: data.method,
    warnings: data.warnings,
    attempts: data.attempts,
    usedOcr: data.usedOcr,
    qualityScore,
    normalizationApplied,
    structuredBlocks,
    payloadVersion,
  };
};

const extractBackendErrorMessage = (
  responseText: string,
  status: number
): { message: string; errorCode?: string } => {
  if (!responseText.trim()) {
    return { message: `Backend returned HTTP ${status}` };
  }

  try {
    const parsed = JSON.parse(responseText) as {
      error?: unknown;
      message?: unknown;
      errorCode?: unknown;
    };
    const errorCode = toNonEmptyString(parsed.errorCode);
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return {
        message: `Backend returned HTTP ${status}: ${parsed.error.trim()}`,
        errorCode,
      };
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return {
        message: `Backend returned HTTP ${status}: ${parsed.message.trim()}`,
        errorCode,
      };
    }
  } catch {
    // ignore parse failure
  }

  return {
    message: `Backend returned HTTP ${status}: ${responseText.trim()}`,
  };
};

const executeBackendExtractionRequest = async (
  endpoint: string,
  fileType: ImportedFileType,
  requestInit: RequestInit
): Promise<FileExtractionResult> => {
  const response = await fetch(endpoint, requestInit);
  const responseText = await response.text();

  if (!response.ok) {
    const parsedError = extractBackendErrorMessage(
      responseText,
      response.status
    );
    const error = createErrorWithCause(parsedError.message, {
      statusCode: response.status,
      errorCode: parsedError.errorCode,
    }) as Error & { statusCode?: number; errorCode?: string };
    error.statusCode = response.status;
    if (parsedError.errorCode) {
      error.errorCode = parsedError.errorCode;
    }
    throw error;
  }

  if (!responseText.trim()) {
    throw new Error("Backend extraction response was empty.");
  }

  const body = JSON.parse(responseText) as FileExtractionResponse;
  return parseBackendExtractionResult(fileType, body);
};

const createErrorWithCause = (message: string, cause: unknown): Error => {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
};

export const probeBackendPdfOcrReadiness = async (
  options?: BackendExtractOptions
): Promise<BackendPdfOcrReadiness> => {
  const endpoint = resolveBackendExtractionEndpoint(options?.endpoint);
  const healthEndpoint = resolveBackendHealthEndpoint(endpoint);

  const timeoutMs = options?.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(healthEndpoint, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ready: false,
        healthEndpoint,
        errorCode: "PDF_OCR_HEALTH_HTTP_ERROR",
        errorMessage: `Health endpoint returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      ocrConfigured?: unknown;
      ocrAgent?: {
        errorCodes?: unknown;
        dependencies?: {
          pdftoppm?: {
            available?: unknown;
            errorCode?: unknown;
            errorMessage?: unknown;
          };
        };
      };
    };

    const ocrConfigured = payload?.ocrConfigured === true;
    const pdftoppm = payload?.ocrAgent?.dependencies?.pdftoppm;
    const pdftoppmAvailable = pdftoppm?.available === true;
    const pdftoppmReported = pdftoppm !== undefined && pdftoppm !== null;

    if (ocrConfigured && (pdftoppmAvailable || !pdftoppmReported)) {
      return {
        ready: true,
        healthEndpoint,
        ocrConfigured: true,
      };
    }

    const agentErrorCodes = Array.isArray(payload?.ocrAgent?.errorCodes)
      ? payload.ocrAgent.errorCodes.filter((entry) => typeof entry === "string")
      : [];

    const errorCode =
      toNonEmptyString(pdftoppm?.errorCode) ||
      (agentErrorCodes.length > 0 ? agentErrorCodes[0] : undefined) ||
      "PDF_OCR_BACKEND_NOT_READY";

    const errorMessage =
      toNonEmptyString(pdftoppm?.errorMessage) ||
      "Backend OCR readiness check failed.";

    return {
      ready: false,
      healthEndpoint,
      ocrConfigured,
      errorCode,
      errorMessage,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ready: false,
        healthEndpoint,
        errorCode: "PDF_OCR_HEALTH_TIMEOUT",
        errorMessage: "Backend OCR health check timed out.",
      };
    }

    return {
      ready: false,
      healthEndpoint,
      errorCode: "PDF_OCR_HEALTH_UNREACHABLE",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to reach backend OCR health endpoint.",
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

/**
 * يستخرج نص الملف عبر Backend API.
 *
 * يُرسل الملف كـ Base64 في جسم JSON ويستقبل {@link FileExtractionResult}.
 * يدعم مهلة زمنية عبر AbortController (الافتراضي 45 ثانية).
 *
 * @param file - كائن الملف المراد استخراجه
 * @param fileType - نوع الملف المُحدد مسبقاً
 * @param options - خيارات اختيارية (endpoint، مهلة)
 * @returns نتيجة الاستخراج
 * @throws {Error} عند فشل الاتصال أو انتهاء المهلة
 */
export const extractFileWithBackend = async (
  file: File,
  fileType: ImportedFileType,
  options?: BackendExtractOptions
): Promise<FileExtractionResult> => {
  const endpoint = resolveBackendExtractionEndpoint(options?.endpoint);

  const timeoutMs = options?.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sendJsonRequest = async (): Promise<FileExtractionResult> => {
      const arrayBuffer = await file.arrayBuffer();
      const payload = {
        filename: file.name,
        extension: fileType,
        fileBase64: arrayBufferToBase64(arrayBuffer),
      };

      return executeBackendExtractionRequest(endpoint, fileType, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    };

    return await sendJsonRequest();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createErrorWithCause("Backend extraction timed out.", error);
    }
    if (error instanceof TypeError) {
      throw createErrorWithCause(
        `تعذر الاتصال بخدمة Backend extraction على ${endpoint}.`,
        error
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};
