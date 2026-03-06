import type { OcrPageResult, OcrProvider } from "../types";

type MistralOcrResponse = {
  pages?: Array<{
    index?: number;
    markdown?: string;
    text?: string;
  }>;
  document_annotation?: string | null;
};

const CANONICAL_MISTRAL_OCR_MODEL = "mistral-ocr-latest";
const CANONICAL_MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

export class MistralOcrProvider implements OcrProvider {
  public name = "mistral";

  private apiKey: string;
  private model: string;
  private endpoint: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs: number;

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    endpoint?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
  }) {
    this.apiKey = requireApiKey(opts?.apiKey ?? process.env.MISTRAL_API_KEY);
    this.model = resolveHardLockedValue(
      opts?.model ?? process.env.MISTRAL_OCR_MODEL,
      CANONICAL_MISTRAL_OCR_MODEL,
      "MISTRAL_OCR_MODEL"
    );
    this.endpoint = resolveHardLockedValue(
      opts?.endpoint ?? process.env.MISTRAL_OCR_ENDPOINT,
      CANONICAL_MISTRAL_OCR_ENDPOINT,
      "MISTRAL_OCR_ENDPOINT"
    );
    this.timeoutMs = Math.max(1_000, opts?.timeoutMs ?? 90_000);
    this.maxRetries = Math.max(0, Math.min(opts?.maxRetries ?? 1, 5));
    this.retryBaseDelayMs = Math.max(100, opts?.retryBaseDelayMs ?? 500);
  }

  async processPdfPages(input: {
    pdfBuffer: Buffer;
    pages: number[];
    hint?: string;
  }): Promise<OcrPageResult[]> {
    const body = {
      model: this.model,
      document: {
        type: "document_url",
        document_url: toDataUrl(input.pdfBuffer, "application/pdf"),
      },
      ...(input.pages.length > 0 ? { pages: input.pages } : {}),
      extract_header: false,
      extract_footer: false,
    };

    const data = await this.requestJsonWithRetry(body);

    const out: OcrPageResult[] = [];
    for (const p of data.pages || []) {
      const page = p.index ?? -1;
      const text = (p.text ?? p.markdown ?? "").trim();
      out.push({
        page,
        text,
        lines: text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }

    return out;
  }

  private async requestJsonWithRetry(
    body: Record<string, unknown>
  ): Promise<MistralOcrResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const timeoutState = createTimeoutState(this.timeoutMs);
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: timeoutState.signal,
        });

        if (!response.ok) {
          const txt = await response.text().catch(() => "");
          const error = new Error(
            `Mistral OCR failed: ${response.status} ${txt}`
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

        return (await response.json()) as MistralOcrResponse;
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
      `Mistral OCR request failed after retries: ${toErrorMessage(lastError)}`
    );
  }
}

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function normalizeComparableValue(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

function resolveHardLockedValue(
  raw: string | undefined,
  canonical: string,
  label: string
): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return canonical;
  }
  if (normalizeComparableValue(raw) !== normalizeComparableValue(canonical)) {
    throw new Error(
      `${label} is hard-locked to ${canonical}. Received: ${raw.trim()}`
    );
  }
  return canonical;
}

function requireApiKey(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) {
    throw new Error("MISTRAL_API_KEY is required for MistralOcrProvider");
  }
  if (/\s/u.test(value)) {
    throw new Error("MISTRAL_API_KEY is invalid: contains whitespace.");
  }
  return value;
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
