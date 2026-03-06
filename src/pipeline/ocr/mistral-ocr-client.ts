import { readFile } from "node:fs/promises";
import path from "node:path";

const CANONICAL_MISTRAL_OCR_MODEL = "mistral-ocr-latest";
const CANONICAL_MISTRAL_OCR_BASE_URL = "https://api.mistral.ai";

export type MistralResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: unknown };

export interface MistralOcrPage {
  readonly index: number;
  readonly markdown: string;
  readonly images?: readonly unknown[];
  readonly dimensions?: {
    readonly dpi?: number;
    readonly height?: number;
    readonly width?: number;
  };
  readonly [key: string]: unknown;
}

export interface MistralOcrResponse {
  readonly model: string;
  readonly pages: readonly MistralOcrPage[];
  readonly usage_info?: Record<string, unknown>;
  readonly document_annotation?: string | null;
  readonly [key: string]: unknown;
}

export interface MistralFileObject {
  readonly id: string;
  readonly object: "file";
  readonly filename?: string;
  readonly purpose?: "fine-tune" | "batch" | "ocr";
  readonly mimetype?: string | null;
  readonly bytes?: number | null;
  readonly [key: string]: unknown;
}

export interface MistralOcrProcessOptions {
  readonly pages?: readonly number[];
  readonly includeImageBase64?: boolean;
  readonly extractHeader?: boolean;
  readonly extractFooter?: boolean;
  readonly tableFormat?: "markdown" | "html";
  readonly imageLimit?: number;
  readonly imageMinSize?: number;
  readonly bboxAnnotationFormat?: MistralResponseFormat;
  readonly bboxAnnotationPrompt?: string;
  readonly documentAnnotationFormat?: MistralResponseFormat;
  readonly documentAnnotationPrompt?: string;
}

export type MistralOcrInput =
  | { type: "file_path"; filePath: string }
  | { type: "file_id"; fileId: string }
  | { type: "document_url"; documentUrl: string }
  | { type: "image_url"; imageUrl: string };

export interface MistralOcrClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly autoDeleteUploadedFile?: boolean;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

export interface OcrProcessPdfResult {
  readonly provider: string;
  readonly pages: readonly { pageIndex: number; markdown: string }[];
  readonly raw: MistralOcrResponse;
}

export class MistralOcrClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly autoDeleteUploadedFile: boolean;
  private readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(options: MistralOcrClientOptions = {}) {
    this.apiKey = requireApiKey(options.apiKey ?? process.env.MISTRAL_API_KEY);

    this.baseUrl = resolveHardLockedBaseUrl(
      options.baseUrl ?? process.env.MISTRAL_BASE_URL
    );
    this.model = resolveHardLockedModel(
      options.model ?? process.env.MISTRAL_OCR_MODEL
    );
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 5));
    this.retryBaseDelayMs = Math.max(100, options.retryBaseDelayMs ?? 500);
    this.autoDeleteUploadedFile = options.autoDeleteUploadedFile ?? false;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async processPdf(
    filePath: string,
    options: MistralOcrProcessOptions = {}
  ): Promise<OcrProcessPdfResult> {
    const raw = await this.process({ type: "file_path", filePath }, options);
    return {
      provider: "mistral-ocr",
      pages: (raw.pages ?? []).map((page) => ({
        pageIndex: typeof page.index === "number" ? page.index : 0,
        markdown: typeof page.markdown === "string" ? page.markdown : "",
      })),
      raw,
    };
  }

  async process(
    input: MistralOcrInput,
    options: MistralOcrProcessOptions = {}
  ): Promise<MistralOcrResponse> {
    let uploadedFileId: string | undefined;

    try {
      const document = await this.buildDocumentPayload(input, (fileId) => {
        uploadedFileId = fileId;
      });

      const body = {
        model: this.model,
        document,
        ...(options.pages?.length ? { pages: [...options.pages] } : {}),
        ...(typeof options.includeImageBase64 === "boolean"
          ? { include_image_base64: options.includeImageBase64 }
          : {}),
        ...(typeof options.extractHeader === "boolean"
          ? { extract_header: options.extractHeader }
          : {}),
        ...(typeof options.extractFooter === "boolean"
          ? { extract_footer: options.extractFooter }
          : {}),
        ...(options.tableFormat ? { table_format: options.tableFormat } : {}),
        ...(typeof options.imageLimit === "number"
          ? { image_limit: options.imageLimit }
          : {}),
        ...(typeof options.imageMinSize === "number"
          ? { image_min_size: options.imageMinSize }
          : {}),
        ...(options.bboxAnnotationFormat
          ? { bbox_annotation_format: options.bboxAnnotationFormat }
          : {}),
        ...(options.bboxAnnotationPrompt
          ? { bbox_annotation_prompt: options.bboxAnnotationPrompt }
          : {}),
        ...(options.documentAnnotationFormat
          ? { document_annotation_format: options.documentAnnotationFormat }
          : {}),
        ...(options.documentAnnotationPrompt
          ? { document_annotation_prompt: options.documentAnnotationPrompt }
          : {}),
      };

      return await this.requestJson<MistralOcrResponse>("/v1/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } finally {
      if (uploadedFileId && this.autoDeleteUploadedFile) {
        try {
          await this.deleteFile(uploadedFileId);
        } catch {
          // best-effort cleanup
        }
      }
    }
  }

  async uploadFile(
    filePath: string,
    purpose: "ocr" | "batch" | "fine-tune" = "ocr"
  ): Promise<MistralFileObject> {
    const buffer = await readFile(filePath);
    const form = new FormData();
    const fileName = path.basename(filePath);
    const mimeType = inferMimeType(fileName);

    form.append("purpose", purpose);
    form.append("file", new Blob([buffer], { type: mimeType }), fileName);

    return this.requestJson<MistralFileObject>("/v1/files", {
      method: "POST",
      body: form,
      headers: {},
    });
  }

  async deleteFile(
    fileId: string
  ): Promise<{ id: string; deleted: boolean; object: string }> {
    return this.requestJson<{ id: string; deleted: boolean; object: string }>(
      `/v1/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: {},
      }
    );
  }

  private async buildDocumentPayload(
    input: MistralOcrInput,
    onUploaded?: (fileId: string) => void
  ): Promise<Record<string, unknown>> {
    switch (input.type) {
      case "file_id":
        return { file_id: input.fileId };

      case "document_url":
        return {
          type: "document_url",
          document_url: input.documentUrl,
        };

      case "image_url":
        return {
          type: "image_url",
          image_url: input.imageUrl,
        };

      case "file_path": {
        const uploaded = await this.uploadFile(input.filePath, "ocr");
        onUploaded?.(uploaded.id);
        return { file_id: uploaded.id };
      }
    }
  }

  private async requestJson<T>(route: string, init: RequestInit): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const timeoutState = createTimeoutState(this.timeoutMs);
      try {
        const headers = new Headers(init.headers ?? {});
        headers.set("Authorization", `Bearer ${this.apiKey}`);
        if (!headers.has("Accept")) {
          headers.set("Accept", "application/json");
        }
        for (const [key, value] of Object.entries(this.defaultHeaders)) {
          if (!headers.has(key)) headers.set(key, value);
        }

        const response = await fetch(`${this.baseUrl}${route}`, {
          ...init,
          headers,
          signal: timeoutState.signal,
        });

        const text = await response.text();
        const json = text ? safeJsonParse(text) : null;

        if (!response.ok) {
          const error = new Error(
            `Mistral API error ${response.status}: ${
              typeof json === "object" && json ? JSON.stringify(json) : text
            }`
          );

          if (isRetryableStatus(response.status) && attempt < this.maxRetries) {
            attempt += 1;
            await sleep(
              exponentialBackoffDelay(this.retryBaseDelayMs, attempt)
            );
            continue;
          }

          throw error;
        }

        return json as T;
      } catch (error) {
        lastError = error;
        if (
          shouldRetryRequest(error, timeoutState.didTimeout) &&
          attempt < this.maxRetries
        ) {
          attempt += 1;
          await sleep(exponentialBackoffDelay(this.retryBaseDelayMs, attempt));
          continue;
        }
        throw error;
      } finally {
        timeoutState.cleanup();
      }
    }

    throw new Error(
      `Mistral request failed after retries: ${toErrorMessage(lastError)}`
    );
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireApiKey(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) {
    throw new Error("MISTRAL_API_KEY is missing.");
  }
  if (/\s/u.test(value)) {
    throw new Error("MISTRAL_API_KEY is invalid: contains whitespace.");
  }
  return value;
}

function normalizeComparableValue(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

function resolveHardLockedModel(raw: string | undefined): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return CANONICAL_MISTRAL_OCR_MODEL;
  }
  if (
    normalizeComparableValue(raw) !==
    normalizeComparableValue(CANONICAL_MISTRAL_OCR_MODEL)
  ) {
    throw new Error(
      `MISTRAL_OCR_MODEL is hard-locked to ${CANONICAL_MISTRAL_OCR_MODEL}. Received: ${raw.trim()}`
    );
  }
  return CANONICAL_MISTRAL_OCR_MODEL;
}

function resolveHardLockedBaseUrl(raw: string | undefined): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return CANONICAL_MISTRAL_OCR_BASE_URL;
  }
  const normalized = normalizeComparableValue(raw);
  if (normalized !== normalizeComparableValue(CANONICAL_MISTRAL_OCR_BASE_URL)) {
    throw new Error(
      `MISTRAL OCR base URL is hard-locked to ${CANONICAL_MISTRAL_OCR_BASE_URL}. Received: ${raw.trim()}`
    );
  }
  return CANONICAL_MISTRAL_OCR_BASE_URL;
}

function createTimeoutState(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const hasAbortSignalTimeout =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as unknown as { timeout?: unknown }).timeout ===
      "function";

  if (hasAbortSignalTimeout) {
    const timeoutSignal = (
      AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }
    ).timeout(timeoutMs);
    return {
      signal: timeoutSignal,
      cleanup: () => undefined,
      didTimeout: () => timeoutSignal.aborted,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
    didTimeout: () => controller.signal.aborted,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function shouldRetryRequest(
  error: unknown,
  didTimeout: () => boolean
): boolean {
  if (didTimeout()) {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return true;
    }
    const lowerMessage = error.message.toLowerCase();
    if (
      lowerMessage.includes("fetch failed") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("timed out")
    ) {
      return true;
    }
  }
  return false;
}

function exponentialBackoffDelay(baseDelayMs: number, attempt: number): number {
  const withExponent = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * 100);
  return withExponent + jitter;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

/**
 * محوّل مساعد: دمج صفحات الـOCR إلى نص خام قابل للمقارنة مع DOCX.
 * - لا يعيد ترتيب الصفحات.
 * - يفصل الصفحات بسطرين فقط.
 */
export function mistralOcrPagesToText(
  pages: readonly { index: number; markdown: string }[]
): string {
  return [...pages]
    .sort((a, b) => a.index - b.index)
    .map((page) => (page.markdown ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}
