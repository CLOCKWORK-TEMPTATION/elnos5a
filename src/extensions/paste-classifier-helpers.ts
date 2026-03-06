/**
 * @module extensions/paste-classifier-helpers
 * @description دوال مساعدة لمصنف اللصق — UUID، fetch، text normalization، hint queues
 */

import type {
  ClassifiedDraft,
  ClassificationSourceProfile,
  ElementType,
} from "./classification-types";
import { fromLegacyElementType } from "./classification-types";
import { convertHindiToArabic } from "./arabic-patterns";
import { parseBulletLine } from "./line-repair";
import {
  agentReviewLogger,
  FALLBACK_ITEM_ID_PREFIX,
} from "./paste-classifier-config";

// ─── UUID Generation ──────────────────────────────────────────────

const bytesToUuidV4 = (bytes: Uint8Array): string => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
};

export const generateItemId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return bytesToUuidV4(bytes);
  }
  const fallback = `${FALLBACK_ITEM_ID_PREFIX}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  agentReviewLogger.warn("item-id-fallback-non-crypto", {
    prefix: FALLBACK_ITEM_ID_PREFIX,
  });
  return fallback;
};

// ─── Fetch Helpers ────────────────────────────────────────────────

type AbortSignalStatic = {
  timeout?: (milliseconds: number) => AbortSignal;
  any?: (signals: AbortSignal[]) => AbortSignal;
};

export const buildFetchSignal = (
  controller: AbortController,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } => {
  const abortSignalStatic = globalThis.AbortSignal as AbortSignalStatic;
  if (
    abortSignalStatic &&
    typeof abortSignalStatic.timeout === "function" &&
    typeof abortSignalStatic.any === "function"
  ) {
    const timeoutSignal = abortSignalStatic.timeout(timeoutMs);
    return {
      signal: abortSignalStatic.any([controller.signal, timeoutSignal]),
      cleanup: () => {},
    };
  }

  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => globalThis.clearTimeout(timeoutId),
  };
};

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  controller: AbortController,
  timeoutMs: number
): Promise<Response> => {
  const { signal, cleanup } = buildFetchSignal(controller, timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    cleanup();
  }
};

// ─── Text Normalization ───────────────────────────────────────────

/** حروف غير مرئية clipboard-only (بدون ZWNJ U+200C و ZWJ U+200D — مستخدمين في العربية) */
const CLIPBOARD_INVISIBLE_RE =
  /[\u200B\u200E\u200F\u061C\u2060-\u2069\u202A-\u202E\uFEFF\u00AD\uFFFC]/g;

export const normalizeRawInputText = (text: string): string => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(CLIPBOARD_INVISIBLE_RE, "")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n+$/, "");
};

// ─── Structured Hint Queues ───────────────────────────────────────

interface StructuredHintLike {
  formatId?: unknown;
  text?: unknown;
}

const normalizeHintLookupText = (value: string): string => {
  const bulletNormalized = parseBulletLine(value) ?? value;
  return convertHindiToArabic(bulletNormalized).replace(/\s+/g, " ").trim();
};

export const toSourceProfile = (
  value: string | undefined
): ClassificationSourceProfile | undefined => {
  if (value === "paste" || value === "generic-open") {
    return value;
  }
  return undefined;
};

const toHintElementType = (formatId: unknown): ElementType | null => {
  if (typeof formatId !== "string") return null;
  return fromLegacyElementType(formatId);
};

export const buildStructuredHintQueues = (
  structuredHints: readonly unknown[] | undefined
): Map<string, ElementType[]> => {
  const queues = new Map<string, ElementType[]>();
  if (!structuredHints || structuredHints.length === 0) return queues;

  for (const hintEntry of structuredHints) {
    if (!hintEntry || typeof hintEntry !== "object") continue;
    const hint = hintEntry as StructuredHintLike;
    const hintType = toHintElementType(hint.formatId);
    if (!hintType || typeof hint.text !== "string") continue;

    const hintLines = hint.text
      .split(/\r?\n/)
      .map((line) => normalizeHintLookupText(line))
      .filter((line) => line.length > 0);

    for (const line of hintLines) {
      const queue = queues.get(line);
      if (queue) {
        queue.push(hintType);
      } else {
        queues.set(line, [hintType]);
      }
    }
  }

  return queues;
};

export const consumeSourceHintTypeForLine = (
  lineText: string,
  hintQueues: Map<string, ElementType[]>
): ElementType | undefined => {
  const normalized = normalizeHintLookupText(lineText);
  if (!normalized) return undefined;

  const queue = hintQueues.get(normalized);
  if (!queue || queue.length === 0) return undefined;

  const hintType = queue.shift();
  if (queue.length === 0) {
    hintQueues.delete(normalized);
  }

  return hintType;
};

// ─── Misc Helpers ─────────────────────────────────────────────────

export const shouldSkipAgentReviewInRuntime = (): boolean => {
  return true;
};

export const waitBeforeRetry = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

export const isRetryableHttpStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

export const toUniqueSortedIndexes = (values: readonly number[]): number[] =>
  [
    ...new Set(values.filter((value) => Number.isInteger(value) && value >= 0)),
  ].sort((a, b) => a - b);

export const toNormalizedMetaIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        ),
      ].sort()
    : [];

/** واجهة محلية توسع ClassifiedDraft بـ _itemId (معرف فريد لكل عنصر) */
export interface ClassifiedDraftWithId extends ClassifiedDraft {
  _itemId?: string;
}
