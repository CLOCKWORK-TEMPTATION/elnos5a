/**
 * @description خدمة Mistral OCR لاستخراج النصوص من ملفات PDF
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { JsonRecord, MistralOCRConfig } from "./types.js";
import { log, APP_NAME } from "./ocr-logger.js";
import {
  createTimeoutState,
  ensureMistralApiKey,
  field,
  fileExists,
  getEnvOrRaise,
  isRetryableHttpStatus,
  isRetryableRequestError,
  retryDelayMs,
  str,
} from "./text-helpers.js";

const DEFAULT_MISTRAL_OCR_MODEL = "mistral-ocr-latest";
const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
const MISTRAL_HTTP_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.MISTRAL_HTTP_TIMEOUT_MS ?? "120000", 10) ||
    120_000
);
const MISTRAL_HTTP_MAX_RETRIES = Math.max(
  0,
  Math.min(
    Number.parseInt(process.env.MISTRAL_HTTP_MAX_RETRIES ?? "2", 10) || 2,
    5
  )
);

export class MistralOCRService {
  private readonly config: MistralOCRConfig;
  private annotationSchemaCache?: JsonRecord;
  private lastDocumentAnnotation?: unknown;

  constructor(config: MistralOCRConfig) {
    if (config.model !== DEFAULT_MISTRAL_OCR_MODEL) {
      throw new Error(
        `Mistral OCR model must be ${DEFAULT_MISTRAL_OCR_MODEL}. Received: ${config.model}`
      );
    }
    this.config = config;
  }

  getLastDocumentAnnotation(): unknown {
    return this.lastDocumentAnnotation;
  }

  async processDocumentUrl(
    documentUrl: string,
    documentName?: string
  ): Promise<string> {
    this.lastDocumentAnnotation = undefined;

    const documentPayload: JsonRecord = {
      type: "document_url",
      document_url: documentUrl,
    };
    if (documentName) {
      documentPayload.document_name = documentName;
    }

    const body: JsonRecord = {
      model: this.config.model,
      document: documentPayload,
      ...(await this.buildCommonRequestKwargs()),
    };

    const response = await this.requestJson("POST", "/ocr", body);
    return this.extractMarkdownFromResponse(response);
  }

  async processPdfFile(pdfPath: string): Promise<string> {
    if (!(await fileExists(pdfPath))) {
      throw new Error(`ملف PDF غير موجود: ${pdfPath}`);
    }

    const pdfBytes = await readFile(pdfPath);
    const form = new FormData();
    form.append("purpose", "ocr");
    form.append(
      "file",
      new Blob([pdfBytes], { type: "application/pdf" }),
      path.basename(pdfPath)
    );

    let fileId = "";

    try {
      const upload = await this.requestJson("POST", "/files", form);
      fileId = str(field(upload, "id", "")).trim();
      if (!fileId) {
        throw new Error("لم يتم الحصول على معرف الملف بعد الرفع إلى Mistral.");
      }

      const signedUrl = await this.getSignedUrl(fileId);
      if (!signedUrl) {
        throw new Error("تعذر الحصول على signed URL من Mistral.");
      }

      if (this.config.useBatchOCR) {
        try {
          return await this.processDocumentViaBatch(
            signedUrl,
            path.basename(pdfPath)
          );
        } catch (error) {
          log(
            "WARN",
            "تعذر/فشل Batch OCR (%s). fallback إلى OCR المباشر.",
            String(error)
          );
        }
      }

      return this.processDocumentUrl(signedUrl, path.basename(pdfPath));
    } finally {
      if (fileId) {
        try {
          await this.requestJson(
            "DELETE",
            `/files/${encodeURIComponent(fileId)}`
          );
        } catch (cleanupError) {
          log(
            "WARN",
            "تعذر حذف ملف OCR المؤقت من Mistral (%s): %s",
            fileId,
            String(cleanupError)
          );
        }
      }
    }
  }

  private async processDocumentViaBatch(
    documentUrl: string,
    documentName?: string
  ): Promise<string> {
    this.lastDocumentAnnotation = undefined;

    const payload: JsonRecord = {
      document: {
        type: "document_url",
        document_url: documentUrl,
        ...(documentName ? { document_name: documentName } : {}),
      },
      ...(await this.buildCommonRequestKwargs()),
    };

    const timeoutHours = Math.max(
      1,
      Math.ceil(this.config.batchTimeoutSec / 3600)
    );
    const batch = await this.requestJson("POST", "/batch/jobs", {
      endpoint: "/v1/ocr",
      model: this.config.model,
      requests: [{ custom_id: "ocr-document-0", body: payload }],
      timeout_hours: timeoutHours,
    });

    const jobId = str(field(batch, "id", "")).trim();
    if (!jobId) {
      throw new Error("تعذر إنشاء Batch Job صالح لعملية OCR.");
    }

    log("INFO", "تم إنشاء Batch OCR job: %s", jobId);

    const deadline = Date.now() + this.config.batchTimeoutSec * 1000;
    const pollInterval = Math.max(
      500,
      Math.round(this.config.batchPollIntervalSec * 1000)
    );

    while (true) {
      const job = await this.requestJson(
        "GET",
        `/batch/jobs/${encodeURIComponent(jobId)}?inline=true`
      );
      const status = str(field(job, "status", "")).toUpperCase();
      const completed = Number(field(job, "completed_requests", 0));
      const total = Number(field(job, "total_requests", 0));

      log("INFO", "Batch OCR status=%s (%s/%s)", status, completed, total);

      if (status === "SUCCESS") {
        const markdown = (await this.extractMarkdownFromBatchJob(job)).trim();
        if (markdown) {
          return markdown;
        }
        throw new Error("Batch OCR نجح لكن الناتج كان فارغاً.");
      }

      if (["FAILED", "TIMEOUT_EXCEEDED", "CANCELLED"].includes(status)) {
        const errors = field(job, "errors", []);
        throw new Error(
          `Batch OCR انتهى بالحالة ${status}. errors=${JSON.stringify(errors)}`
        );
      }

      if (Date.now() >= deadline) {
        try {
          await this.requestJson(
            "POST",
            `/batch/jobs/${encodeURIComponent(jobId)}/cancel`
          );
          log(
            "WARN",
            "تم إرسال طلب إلغاء لـ Batch OCR job بعد تجاوز المهلة: %s",
            jobId
          );
        } catch (cancelError) {
          log(
            "WARN",
            "تعذر إلغاء Batch OCR job %s بعد انتهاء المهلة: %s",
            jobId,
            String(cancelError)
          );
        }
        throw new Error(
          `انتهت مهلة Batch OCR (${this.config.batchTimeoutSec}s) قبل الاكتمال.`
        );
      }

      await sleep(pollInterval);
    }
  }

  private async extractMarkdownFromBatchJob(job: unknown): Promise<string> {
    const outputs = field<unknown[]>(job, "outputs", []);
    if (Array.isArray(outputs) && outputs.length > 0) {
      for (const item of outputs) {
        const body = this.extractBatchBody(item);
        if (!body) {
          continue;
        }
        const md = this.extractMarkdownFromResponse(body).trim();
        if (md) {
          return md;
        }
      }
    }

    const outputFileId = str(
      field(job, "output_file", "") || field(job, "output_file_id", "")
    ).trim();
    if (outputFileId) {
      const text = await this.downloadFileText(outputFileId);
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        let row: unknown;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }

        const body = this.extractBatchBody(row);
        if (!body) {
          continue;
        }

        const md = this.extractMarkdownFromResponse(body).trim();
        if (md) {
          return md;
        }
      }
    }

    return "";
  }

  private extractBatchBody(row: unknown): JsonRecord | undefined {
    if (!row || typeof row !== "object") {
      return undefined;
    }

    const responseObj = field(row, "response", null);
    if (responseObj && typeof responseObj === "object") {
      const body = field(responseObj, "body", null);
      if (body && typeof body === "object") {
        return body as JsonRecord;
      }
    }

    const body = field(row, "body", null);
    if (body && typeof body === "object") {
      return body as JsonRecord;
    }

    if (Array.isArray(field(row, "pages", null))) {
      return row as JsonRecord;
    }

    return undefined;
  }

  private async buildCommonRequestKwargs(): Promise<JsonRecord> {
    const kwargs: JsonRecord = {};

    if (this.config.tableFormat) {
      kwargs.table_format = this.config.tableFormat;
    }
    if (this.config.extractHeader) {
      kwargs.extract_header = true;
    }
    if (this.config.extractFooter) {
      kwargs.extract_footer = true;
    }
    if (this.config.includeImageBase64) {
      kwargs.include_image_base64 = true;
    }

    const annotationFormat = await this.buildAnnotationFormat();
    if (annotationFormat) {
      kwargs.document_annotation_format = annotationFormat;
      if (this.config.annotationPrompt) {
        kwargs.document_annotation_prompt = this.config.annotationPrompt;
      }
    }

    return kwargs;
  }

  private async buildAnnotationFormat(): Promise<JsonRecord | undefined> {
    const schema = await this.loadAnnotationSchema();
    if (!schema) {
      return undefined;
    }

    const schemaType = str(field(schema, "type", "")).trim();
    if (["json_schema", "json_object", "text"].includes(schemaType)) {
      return schema;
    }

    return {
      type: "json_schema",
      json_schema: {
        name: "document_annotation",
        schema,
        strict: Boolean(this.config.annotationStrict),
      },
    };
  }

  private async loadAnnotationSchema(): Promise<JsonRecord | undefined> {
    if (!this.config.annotationSchemaPath) {
      return undefined;
    }
    if (this.annotationSchemaCache) {
      return this.annotationSchemaCache;
    }

    if (!(await fileExists(this.config.annotationSchemaPath))) {
      throw new Error(
        `ملف annotation schema غير موجود: ${this.config.annotationSchemaPath}`
      );
    }

    const content = await readFile(this.config.annotationSchemaPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("ملف annotation schema يجب أن يكون كائن JSON.");
    }

    this.annotationSchemaCache = parsed as JsonRecord;
    return this.annotationSchemaCache;
  }

  private extractMarkdownFromResponse(response: unknown): string {
    this.captureAnnotation(response);

    const pages = field<unknown[]>(response, "pages", []);
    if (!Array.isArray(pages) || pages.length === 0) {
      return "";
    }

    const pageMarkdowns: string[] = [];
    for (const page of pages) {
      const markdown = str(field(page, "markdown", "")).trim();
      if (markdown) {
        pageMarkdowns.push(markdown);
      }
    }

    return pageMarkdowns.join("\n\n").trim();
  }

  private captureAnnotation(response: unknown): void {
    const raw = field<string | object | null>(
      response,
      "document_annotation",
      null
    );
    if (raw === null || raw === undefined) {
      return;
    }

    if (typeof raw === "string") {
      const stripped = (raw as string).trim();
      if (!stripped) {
        return;
      }
      try {
        this.lastDocumentAnnotation = JSON.parse(stripped);
      } catch {
        this.lastDocumentAnnotation = stripped;
      }
      return;
    }

    this.lastDocumentAnnotation = raw;
  }

  private async getSignedUrl(fileId: string): Promise<string> {
    const attempts: Array<{
      method: "GET" | "POST";
      endpoint: string;
      body?: unknown;
    }> = [
      {
        method: "GET",
        endpoint: `/files/${encodeURIComponent(fileId)}/url?expiry=24`,
      },
      {
        method: "GET",
        endpoint: `/files/${encodeURIComponent(fileId)}/signed-url`,
      },
      {
        method: "POST",
        endpoint: `/files/${encodeURIComponent(fileId)}/url`,
        body: { expiry: 24 },
      },
      {
        method: "POST",
        endpoint: `/files/${encodeURIComponent(fileId)}/signed-url`,
        body: { expiry: 24 },
      },
    ];

    for (const a of attempts) {
      try {
        const resp = await this.requestJson(a.method, a.endpoint, a.body);
        const top = str(field(resp, "url", "")).trim();
        if (top) {
          return top;
        }

        const dataObj = field(resp, "data", null);
        if (dataObj && typeof dataObj === "object") {
          const nested = str(field(dataObj, "url", "")).trim();
          if (nested) {
            return nested;
          }
        }
      } catch {
        // continue
      }
    }

    throw new Error("تعذر الحصول على signed URL من Mistral بعد عدة محاولات.");
  }

  private async downloadFileText(fileId: string): Promise<string> {
    const endpoints = [
      `/files/${encodeURIComponent(fileId)}/content`,
      `/files/${encodeURIComponent(fileId)}/download`,
      `/files/${encodeURIComponent(fileId)}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.requestRaw("GET", endpoint);
        if (!response.ok) {
          continue;
        }
        return await response.text();
      } catch {
        // continue
      }
    }

    return "";
  }

  private async requestJson(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    body?: unknown
  ): Promise<JsonRecord> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= MISTRAL_HTTP_MAX_RETRIES) {
      try {
        const response = await this.requestRaw(method, endpoint, body);
        const raw = await response.text();

        let data: unknown = {};
        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = { raw };
          }
        }

        if (!response.ok) {
          const requestId =
            data && typeof data === "object"
              ? str(
                  field(data, "request_id", "") || field(data, "requestId", "")
                ).trim()
              : "";

          if (
            isRetryableHttpStatus(response.status) &&
            attempt < MISTRAL_HTTP_MAX_RETRIES
          ) {
            attempt += 1;
            const delay = retryDelayMs(attempt);
            log(
              "WARN",
              "Mistral API returned %s for %s %s. retry=%s delayMs=%s",
              response.status,
              method,
              endpoint,
              attempt,
              delay
            );
            await sleep(delay);
            continue;
          }

          const requestSuffix = requestId ? ` request_id=${requestId}` : "";
          throw new Error(
            `Mistral API error ${response.status} ${response.statusText}${requestSuffix}: ${raw}`
          );
        }

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return {};
        }

        return data as JsonRecord;
      } catch (error) {
        lastError = error;
        if (
          isRetryableRequestError(error) &&
          attempt < MISTRAL_HTTP_MAX_RETRIES
        ) {
          attempt += 1;
          const delay = retryDelayMs(attempt);
          log(
            "WARN",
            "Mistral request failed for %s %s. retry=%s delayMs=%s error=%s",
            method,
            endpoint,
            attempt,
            delay,
            String(error)
          );
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Mistral request failed after retries: ${String(lastError)}`
    );
  }

  private async requestRaw(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    body?: unknown
  ): Promise<Response> {
    const apiKey = ensureMistralApiKey(getEnvOrRaise("MISTRAL_API_KEY"));
    const url = `${MISTRAL_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": `${APP_NAME}/1.0`,
    };

    let bodyInit: string | FormData | undefined;
    if (body !== undefined) {
      if (body instanceof FormData) {
        bodyInit = body;
      } else {
        headers["Content-Type"] = "application/json";
        bodyInit = JSON.stringify(body);
      }
    }

    const timeoutState = createTimeoutState(MISTRAL_HTTP_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method,
        headers,
        body: bodyInit,
        signal: timeoutState.signal,
      });
    } finally {
      timeoutState.cleanup();
    }
  }
}
