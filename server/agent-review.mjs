import { config } from "dotenv";
import axios from "axios";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { resolveAnthropicApiRuntime } from "./provider-api-runtime.mjs";

// تحميل متغيرات البيئة
config();

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";
const FALLBACK_MODEL_ID = "claude-haiku-4-5-20251001";
const REVIEW_TEMPERATURE = 0.0;
const DEFAULT_TIMEOUT_MS = 180_000;
const AGENT_API_VERSION = "2.0";
const AGENT_API_MODE = "auto-apply";
const NON_ANTHROPIC_MODEL_RE =
  /^(mistral|pixtral|kimi|moonshot|gpt|o\d|gemini|deepseek|llama|qwen)/iu;

// حساب max_tokens ديناميكي بناءً على عدد السطور المشبوهة
// يجب أن تغطي الميزانية: تحليل كل سطر (6 خطوات تحليل مفصلة) + إخراج JSON النهائي
// BASE = ثابت لهيكل الاستجابة + هامش أمان
// PER_LINE = تحليل مفصل (~600 توكن) + أمر JSON (~200 توكن)
const BASE_OUTPUT_TOKENS = 1024;
const TOKENS_PER_SUSPICIOUS_LINE = 800;
const PRACTICAL_MAX_OUTPUT = 64000;

// ─── Retry & backoff settings for overload (529) ───
const OVERLOAD_MAX_RETRIES = 3;
const OVERLOAD_BASE_DELAY_MS = 3_000;
const OVERLOAD_BACKOFF_MULTIPLIER = 2;

const isOverloadError = (error) => {
  if (!error) return false;
  const status =
    typeof error.status === "number"
      ? error.status
      : typeof error.statusCode === "number"
        ? error.statusCode
        : null;
  if (status === 429 || status === 529 || status === 503) return true;
  const msg = String(error.message || error).toLowerCase();
  return msg.includes("overloaded") || msg.includes("rate_limit");
};

const isOverloadAxiosError = (error) => {
  const status = error?.response?.status ?? error?.status;
  if (status === 429 || status === 529 || status === 503) return true;
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("overloaded") || msg.includes("rate_limit");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logger = pino({ name: "agent-review" });
let reviewModelFallbackWarned = false;

// ─────────────────────────────────────────────────────────
// الأنواع المسموحة والثوابت
// ─────────────────────────────────────────────────────────

const ALLOWED_LINE_TYPES = new Set([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);

const ALLOWED_ROUTING_BANDS = new Set(["agent-candidate", "agent-forced"]);

const normalizeSceneHeaderDecisionType = (lineType) => {
  // scene_header_top_line مش نوع تصنيف بعد كده — لو الـ AI رجّعه نحوّله لـ scene_header_1
  if (lineType === "scene_header_top_line") {
    return "scene_header_1";
  }
  return lineType;
};

// ─────────────────────────────────────────────────────────
// أدوات مساعدة للتحقق والتطبيع
// ─────────────────────────────────────────────────────────

const isObjectRecord = (value) => typeof value === "object" && value !== null;
const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;
const isIntegerNumber = (value) => Number.isInteger(value) && value >= 0;
const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const normalizeIncomingText = (value, maxLength = 50_000) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const resolveAnthropicReviewRuntime = () => {
  const requestedRaw = normalizeIncomingText(
    process.env.ANTHROPIC_REVIEW_MODEL ?? process.env.AGENT_REVIEW_MODEL,
    120
  );
  const apiRuntime = resolveAnthropicApiRuntime(process.env);

  if (!requestedRaw) {
    return {
      provider: "anthropic",
      requestedModel: null,
      resolvedModel: DEFAULT_MODEL_ID,
      fallbackApplied: false,
      fallbackReason: null,
      baseUrl: apiRuntime.baseUrl,
      apiVersion: apiRuntime.apiVersion,
      messagesEndpoint: apiRuntime.messagesEndpoint,
    };
  }

  if (/\s/u.test(requestedRaw)) {
    return {
      provider: "anthropic",
      requestedModel: requestedRaw,
      resolvedModel: DEFAULT_MODEL_ID,
      fallbackApplied: true,
      fallbackReason: "invalid-model-whitespace",
      baseUrl: apiRuntime.baseUrl,
      apiVersion: apiRuntime.apiVersion,
      messagesEndpoint: apiRuntime.messagesEndpoint,
    };
  }

  if (NON_ANTHROPIC_MODEL_RE.test(requestedRaw)) {
    return {
      provider: "anthropic",
      requestedModel: requestedRaw,
      resolvedModel: DEFAULT_MODEL_ID,
      fallbackApplied: true,
      fallbackReason: "non-anthropic-model",
      baseUrl: apiRuntime.baseUrl,
      apiVersion: apiRuntime.apiVersion,
      messagesEndpoint: apiRuntime.messagesEndpoint,
    };
  }

  if (!/^claude-/iu.test(requestedRaw)) {
    return {
      provider: "anthropic",
      requestedModel: requestedRaw,
      resolvedModel: DEFAULT_MODEL_ID,
      fallbackApplied: true,
      fallbackReason: "unsupported-model-family",
      baseUrl: apiRuntime.baseUrl,
      apiVersion: apiRuntime.apiVersion,
      messagesEndpoint: apiRuntime.messagesEndpoint,
    };
  }

  return {
    provider: "anthropic",
    requestedModel: requestedRaw,
    resolvedModel: requestedRaw,
    fallbackApplied: false,
    fallbackReason: null,
    baseUrl: apiRuntime.baseUrl,
    apiVersion: apiRuntime.apiVersion,
    messagesEndpoint: apiRuntime.messagesEndpoint,
  };
};

const logReviewModelFallbackOnce = (runtime) => {
  if (!runtime.fallbackApplied || reviewModelFallbackWarned) return;

  reviewModelFallbackWarned = true;
  logger.warn(
    {
      requestedModel: runtime.requestedModel,
      resolvedModel: runtime.resolvedModel,
      fallbackReason: runtime.fallbackReason,
    },
    "agent-review model is not Anthropic-compatible; falling back to default model"
  );
};

const resolveAgentReviewMockMode = () => {
  const value = normalizeIncomingText(process.env.AGENT_REVIEW_MOCK_MODE, 32)
    .toLowerCase()
    .trim();
  if (value === "success" || value === "error") return value;
  return null;
};

// ─────────────────────────────────────────────────────────
// أخطاء التحقق
// ─────────────────────────────────────────────────────────

export class AgentReviewValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentReviewValidationError";
    this.statusCode = 400;
  }
}

// ─────────────────────────────────────────────────────────
// تطبيع بيانات الإدخال
// ─────────────────────────────────────────────────────────

/**
 * تطبيع سياق السطر (Context Line)
 * يحتوي على رقم السطر والنوع المعين والنص
 */
const normalizeReviewContextLine = (line, index) => {
  if (!isObjectRecord(line)) {
    throw new AgentReviewValidationError(
      `Invalid context line at index ${index}.`
    );
  }
  const lineIndex = line.lineIndex;
  const assignedType = normalizeIncomingText(line.assignedType, 64);
  const text = normalizeIncomingText(line.text, 4000);
  if (!isIntegerNumber(lineIndex)) {
    throw new AgentReviewValidationError(
      `Invalid context lineIndex at index ${index}.`
    );
  }
  if (!ALLOWED_LINE_TYPES.has(assignedType)) {
    throw new AgentReviewValidationError(
      `Invalid context assignedType at index ${index}.`
    );
  }
  if (!text) {
    throw new AgentReviewValidationError(
      `Empty context text at index ${index}.`
    );
  }
  return {
    lineIndex,
    assignedType,
    text,
  };
};

/**
 * تطبيع سطر مشتبه فيه (API v2)
 * دعم كل من itemId (الجديد) و itemIndex (القديم للتوافقية)
 * إضافة حقل fingerprint للتتبع
 */
const normalizeSuspiciousLine = (entry, index) => {
  if (!isObjectRecord(entry)) {
    throw new AgentReviewValidationError(
      `Invalid suspicious line payload at index ${index}.`
    );
  }

  // دعم كل من itemId (الجديد) و itemIndex (القديم للتوافقية)
  let itemId = entry.itemId;
  if (!itemId && entry.itemIndex !== undefined) {
    itemId = `item-${entry.itemIndex}`;
  }

  const lineIndex = entry.lineIndex;
  const text = normalizeIncomingText(entry.text, 6000);
  const assignedType = normalizeIncomingText(entry.assignedType, 64);
  const totalSuspicion = entry.totalSuspicion;
  const escalationScore = entry.escalationScore;
  const routingBand = normalizeIncomingText(entry.routingBand, 32);
  const fingerprint =
    normalizeIncomingText(entry.fingerprint, 256) || undefined;

  const criticalMismatch =
    typeof entry.criticalMismatch === "boolean"
      ? entry.criticalMismatch
      : undefined;

  const distinctDetectors = entry.distinctDetectors;
  const reasons = Array.isArray(entry.reasons)
    ? entry.reasons.filter((reason) => isNonEmptyString(reason)).slice(0, 16)
    : [];

  const contextLines = Array.isArray(entry.contextLines)
    ? entry.contextLines.map((line, ctxIndex) =>
        normalizeReviewContextLine(line, ctxIndex)
      )
    : [];

  if (!isNonEmptyString(itemId)) {
    throw new AgentReviewValidationError(
      `Invalid itemId at suspicious line ${index}.`
    );
  }

  if (!isIntegerNumber(lineIndex)) {
    throw new AgentReviewValidationError(
      `Invalid lineIndex at suspicious line ${index}.`
    );
  }

  if (!text) {
    throw new AgentReviewValidationError(
      `Empty text at suspicious line ${index}.`
    );
  }

  if (!ALLOWED_LINE_TYPES.has(assignedType)) {
    throw new AgentReviewValidationError(
      `Invalid assignedType at suspicious line ${index}.`
    );
  }

  if (
    !isFiniteNumber(totalSuspicion) ||
    totalSuspicion < 0 ||
    totalSuspicion > 100
  ) {
    throw new AgentReviewValidationError(
      `Invalid totalSuspicion at suspicious line ${index}.`
    );
  }

  if (
    escalationScore !== undefined &&
    (!isFiniteNumber(escalationScore) ||
      escalationScore < 0 ||
      escalationScore > 100)
  ) {
    throw new AgentReviewValidationError(
      `Invalid escalationScore at suspicious line ${index}.`
    );
  }

  if (routingBand && !ALLOWED_ROUTING_BANDS.has(routingBand)) {
    throw new AgentReviewValidationError(
      `Invalid routingBand at suspicious line ${index}.`
    );
  }

  if (
    distinctDetectors !== undefined &&
    (!isIntegerNumber(distinctDetectors) || distinctDetectors < 0)
  ) {
    throw new AgentReviewValidationError(
      `Invalid distinctDetectors at suspicious line ${index}.`
    );
  }

  return {
    itemId,
    lineIndex,
    text,
    assignedType,
    totalSuspicion,
    reasons,
    contextLines,
    escalationScore,
    routingBand: routingBand || undefined,
    criticalMismatch,
    distinctDetectors,
    fingerprint,
  };
};

/**
 * تطبيع قائمة itemIds (API v2)
 */
const normalizeItemIdList = (value, fieldName) => {
  if (!Array.isArray(value)) return null;
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemId = value[index];
    if (!isNonEmptyString(itemId)) {
      throw new AgentReviewValidationError(
        `Invalid ${fieldName} entry at index ${index}.`
      );
    }
    normalized.push(itemId);
  }
  return [...new Set(normalized)];
};

// ─────────────────────────────────────────────────────────
// التحقق من صحة طلب المراجعة
// ─────────────────────────────────────────────────────────

/**
 * التحقق من صحة طلب المراجعة (API v2)
 */
export const validateAgentReviewRequestBody = (rawBody) => {
  if (!isObjectRecord(rawBody)) {
    throw new AgentReviewValidationError("Invalid agent-review request body.");
  }

  const sessionId = normalizeIncomingText(rawBody.sessionId, 120);
  const importOpId = normalizeIncomingText(rawBody.importOpId, 120);
  const totalReviewed = rawBody.totalReviewed;
  const suspiciousLines = Array.isArray(rawBody.suspiciousLines)
    ? rawBody.suspiciousLines
    : null;
  const reviewPacketText = normalizeIncomingText(
    rawBody.reviewPacketText,
    120_000
  );

  if (!sessionId) {
    throw new AgentReviewValidationError(
      "Missing sessionId in agent-review request."
    );
  }

  if (!importOpId) {
    throw new AgentReviewValidationError(
      "Missing importOpId in agent-review request."
    );
  }

  if (!isIntegerNumber(totalReviewed)) {
    throw new AgentReviewValidationError(
      "Invalid totalReviewed in agent-review request."
    );
  }

  if (!Array.isArray(suspiciousLines)) {
    throw new AgentReviewValidationError(
      "Invalid suspiciousLines in agent-review request."
    );
  }

  const normalizedSuspiciousLines = suspiciousLines.map((entry, index) =>
    normalizeSuspiciousLine(entry, index)
  );

  const suspiciousIdsSet = new Set(
    normalizedSuspiciousLines.map((line) => line.itemId)
  );

  const defaultRequired = [...suspiciousIdsSet];
  const defaultForced = normalizedSuspiciousLines
    .filter((line) => line.routingBand === "agent-forced")
    .map((line) => line.itemId);

  const requiredItemIds =
    normalizeItemIdList(rawBody.requiredItemIds, "requiredItemIds") ??
    defaultRequired;
  const forcedItemIds = normalizeItemIdList(
    rawBody.forcedItemIds,
    "forcedItemIds"
  ) ?? [...new Set(defaultForced)];

  for (const itemId of requiredItemIds) {
    if (!suspiciousIdsSet.has(itemId)) {
      throw new AgentReviewValidationError(
        `requiredItemIds contains unknown itemId: ${itemId}.`
      );
    }
  }

  for (const itemId of forcedItemIds) {
    if (!suspiciousIdsSet.has(itemId)) {
      throw new AgentReviewValidationError(
        `forcedItemIds contains unknown itemId: ${itemId}.`
      );
    }
    if (!requiredItemIds.includes(itemId)) {
      throw new AgentReviewValidationError(
        `forcedItemIds must be subset of requiredItemIds: ${itemId}.`
      );
    }
  }

  return {
    sessionId,
    importOpId,
    totalReviewed,
    reviewPacketText: reviewPacketText || undefined,
    suspiciousLines: normalizedSuspiciousLines,
    requiredItemIds,
    forcedItemIds,
  };
};

// ─────────────────────────────────────────────────────────
// Anthropic Client
// ─────────────────────────────────────────────────────────

let anthropicClientSingleton = null;

const MIN_ANTHROPIC_API_KEY_LENGTH = 20;

export const validateAnthropicApiKey = (value) => {
  const apiKey = normalizeIncomingText(value, 512);
  if (!apiKey) {
    return {
      valid: false,
      message: "ANTHROPIC_API_KEY غير موجود في متغيرات البيئة.",
    };
  }
  if (/\s/.test(apiKey)) {
    return {
      valid: false,
      message: "ANTHROPIC_API_KEY يحتوي على مسافات غير صالحة.",
    };
  }
  if (!apiKey.startsWith("sk-ant-")) {
    return {
      valid: false,
      message: "صيغة ANTHROPIC_API_KEY غير صحيحة (يجب أن تبدأ بـ sk-ant-).",
    };
  }
  if (apiKey.length < MIN_ANTHROPIC_API_KEY_LENGTH) {
    return {
      valid: false,
      message: "ANTHROPIC_API_KEY قصير بشكل غير صالح.",
    };
  }
  return {
    valid: true,
    apiKey,
  };
};

const getAnthropicClient = () => {
  if (anthropicClientSingleton) {
    return anthropicClientSingleton;
  }
  const keyValidation = validateAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  if (!keyValidation.valid) {
    throw new Error(keyValidation.message);
  }
  const runtime = resolveAnthropicReviewRuntime();
  anthropicClientSingleton = new Anthropic({
    apiKey: keyValidation.apiKey,
    baseURL: runtime.baseUrl,
    maxRetries: 0, // نتحكم في retry بنفسنا في reviewSuspiciousLinesWithClaude
    timeout: DEFAULT_TIMEOUT_MS,
  });
  return anthropicClientSingleton;
};

/**
 * استخراج النص من كتل استجابة Anthropic
 */
const extractTextFromAnthropicBlocks = (content) => {
  const chunks = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      chunks.push(block.text);
    }
  }
  return chunks.join("");
};

/**
 * إرسال رسالة عبر Anthropic SDK
 */
const tryCreateMessageWithSdk = async (params) => {
  const client = getAnthropicClient();
  const message = await client.messages.create(params);
  return message;
};

const resolveProviderErrorInfo = (error) => {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      requestId: null,
      status: null,
    };
  }

  const asRecord = /** @type {Record<string, unknown>} */ (error);
  const nestedError = isObjectRecord(asRecord.error)
    ? /** @type {Record<string, unknown>} */ (asRecord.error)
    : null;
  const nestedResponseError =
    nestedError && isObjectRecord(nestedError.error)
      ? /** @type {Record<string, unknown>} */ (nestedError.error)
      : null;

  const providerMessage =
    (nestedResponseError &&
      normalizeIncomingText(nestedResponseError.message)) ||
    (nestedError && normalizeIncomingText(nestedError.message)) ||
    normalizeIncomingText(error.message);
  const requestId =
    (nestedError && normalizeIncomingText(nestedError.request_id, 128)) ||
    normalizeIncomingText(asRecord.requestID, 128) ||
    null;
  const status =
    typeof asRecord.status === "number" && Number.isFinite(asRecord.status)
      ? asRecord.status
      : null;

  return {
    message: providerMessage || "Provider error",
    requestId,
    status,
  };
};

// ─────────────────────────────────────────────────────────
// برومبت وكيل المراجعة النهائية
// ─────────────────────────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `
أنت وكيل متخصص في المراجعة النهائية وإعادة تصنيف عناصر السيناريو العربي. مهمتك الوحيدة هي استقبال الأسطر التي يُحتمل أنها صُنّفت خطأً من نظام كشف الشكوك، واتخاذ القرارات النهائية بشأن أنواع عناصرها الصحيحة.

---

## بيانات الإدخال

ستتلقى بيانات إدخال تحتوي على أسطر مشبوهة من سيناريو عربي مع سياقها المحيط. كل سطر مشبوه يتضمن:
- مُعرّف العنصر (itemId)
- النوع الحالي المُشتبه به (assignedType)
- نص السطر نفسه (text)
- أسطر السياق المحيطة للاسترشاد (contextLines)

---

## مهمتك

راجع كل سطر مشبوه وحدد نوع عنصره الصحيح وفقاً لقواعد التصنيف الموضحة أدناه. يجب عليك إما تأكيد النوع الحالي أو تصحيحه إلى النوع الصحيح.

---

## أنواع العناصر المسموحة

يُسمح لك فقط بتصنيف الأسطر كأحد هذه الأنواع التسعة:

- action — فعل/وصف
- dialogue — حوار
- character — شخصية
- scene_header_1 — رقم المشهد (مثال: مشهد 5)
- scene_header_2 — زمن/موقع المشهد (مثال: ليل - داخلي)
- scene_header_3 — تفصيل الموقع (مثال: شقة محمد - غرفة النوم)
- transition — انتقال
- parenthetical — توجيه أدائي (بين قوسين)
- basmala — بسملة

لا يُسمح بأي أنواع أخرى. لا تستخدم scene_header_top_line.

---

## قواعد التصنيف

### 1. البسملة (BASMALA)

إذا بدأ السطر بـ: بسم الله الرحمن الرحيم (حتى لو تبعها { أو مسافات)

**النوع:** basmala
**الاستخراج:** استخرج "بسم الله الرحمن الرحيم" فقط، ولا تُدرج {

### 2. ترويسة المشهد 1 (scene_header_1)

إذا تطابق السطر مع النمط: مشهد + رقم

**النوع:** scene_header_1
**الاستخراج:** مشهد <رقم>

### 4. ترويسة المشهد 2 (scene_header_2)

إذا احتوى السطر نفسه الخاص بـ scene_header_1 أو السطر الذي يليه مباشرة على: زمن (نهار|ليل|صباح|مساء|فجر) مع موقع (داخلي|خارجي)

**النوع:** scene_header_2
**الاستخراج:** <الزمن>-<الموقع>
**ملاحظة:** حافظ على علامات الترقيم الأصلية كالشرطات والمسافات

### 5. ترويسة المشهد 3 (scene_header_3)

السطر الذي يلي ترويسات المشهد ويحدد موقعاً تفصيلياً (مثال: "منزل…/مكتب…/فيلا…")

**النوع:** scene_header_3
**الاستخراج:** نص الموقع كما هو مكتوب بالضبط

### 6. الانتقال (TRANSITION)

أي سطر يساوي (أو يحتوي فقط على) كلمة انتقالية مثل: قطع

**النوع:** transition
**الاستخراج:** قطع
**ملاحظة:** كل ظهور يُعدّ سطراً مستقلاً

### 7. الشخصية (CHARACTER) — قواعد حرجة

**متى تُصنّف كشخصية:**
صنّف السطر كشخصية فقط إذا احتوى على اسم متبوع بنقطتين (:)

أمثلة: نور : , مدحت : , صوت عمرو دياب :

**النوع:** character
**الاستخراج:** الاسم مع النقطتين، مثال: "نور :"
**ملاحظة:** حافظ دائماً على النقطتين

#### القاعدة الحرجة: الأسماء في الأوصاف ليست شخصية
**يجب أن تبقى الأسماء المذكورة ضمن أسطر الوصف/الفعل مصنفة كفعل (ACTION)، وليس كشخصية (CHARACTER).**

مثال: "تخرج نهال سماحة…"
- هذا فعل (ACTION)، وليس شخصية (CHARACTER)
- الاسم "نهال سماحة" جزء من الوصف السردي، وليس تعريفاً بمتحدث
- لا تستخرج عنصر شخصية من هذا السطر

### 8. الحوار (DIALOGUE) — قواعد حرجة

**متى تُصنّف كحوار:**
أي سطر نصي يأتي مباشرة بعد سطر شخصية (CHARACTER)

**النوع:** dialogue
**الاستخراج:** السطر كما هو مكتوب بالضبط

**الاستمرار:** يستمر الحوار للأسطر التالية حتى يظهر أحد هذه العناصر:
- سطر شخصية جديد (سطر يحتوي على :)
- انتقال (TRANSITION)
- ترويسة مشهد جديدة (SCENE-HEADER)
- سطر فعل/وصف واضح (ACTION)

**ملاحظة حول كلمات الأغاني:** إذا وُصفت أغنية سردياً (مثال: "نسمع … يغني قائلاً …")، فالسطر action. أما إذا عُرضت الكلمات تحت سطر character، فيجب تصنيفها كـ dialogue.

#### القاعدة الحرجة: الأسماء داخل الحوار تبقى حواراً
**يجب ألّا تُفصل الأسماء المذكورة داخل نص الحوار كعناصر شخصية.**

مثال: إذا قالت شخصية "رأيت أحمد أمس"
- تبقى الجملة كاملة كحوار (DIALOGUE)
- "أحمد" مذكور داخل الكلام، وليس متحدثاً جديداً
- لا تُنشئ عنصر شخصية لـ "أحمد"

### 9. الفعل/الوصف (ACTION)

**متى تُصنّف كفعل:**
أي سطر ليس:
- بسملة (BASMALA)
- ترويسة مشهد (1 أو 2 أو 3 أو السطر العلوي)
- انتقال (TRANSITION)
- شخصية (CHARACTER)
- حوار (DIALOGUE) ضمن كتلة حوار
- توجيه أدائي (PARENTHETICAL)

**النوع:** action
**الاستخراج:** السطر كما هو مكتوب بالضبط

#### قاعدة دمج الأفعال
- السطر الوصفي المستقل = عنصر فعل مستقل (ACTION)
- إذا تبعته أسطر تكميلية (عادة بمسافة بادئة، تُكمل الجملة نفسها)، يجب دمجها في عنصر فعل واحد
- لا تدمج سطرين مستقلين في عنصر واحد
- يُسمح بالدمج فقط لأسطر التكملة ذات المسافات البادئة التي تُكمل الجملة نفسها

### 10. التوجيه الأدائي (PARENTHETICAL)

إذا كان السطر محاطاً بالكامل بأقواس () ويظهر عادة بمسافة بادئة بين سطر character وسطر dialogue، أو داخل كتلة dialogue، للإشارة إلى نبرة أو فعل طفيف.

**النوع:** parenthetical
**الاستخراج:** النص داخل الأقواس، متضمناً الأقواس نفسها.

---

## قيود مهمة

1. **استخرج حرفياً:** انسخ النص كما يظهر بالضبط. لا تلخص ولا تُعِد الصياغة ولا تشرح.
2. **لا تُصحّح:** لا تُصلح الإملاء أو القواعد أو "تُطبّع" النص.
3. **لا تخترع:** لا تُنشئ عناصر أو شخصيات غير موجودة في النص.
4. **لا نص إضافي:** لا تُضِف أي نص خارج مخرجات JSON.
5. **أكمل المهمة:** صنّف كل سطر حتى النهاية. لا تتوقف مبكراً.
6. **استخدم الأنواع المسموحة فقط:** استخدم الأنواع العشرة المذكورة أعلاه فقط.
7. **السياق مهم:** انتبه بعناية لما إذا كانت الأسماء تظهر في سياق وصفي أم كتعريفات بمتحدثين.

---

## عملية التحليل

قبل تقديم مخرجات JSON النهائية، يجب عليك تحليل كل سطر مشبوه بشكل منهجي. لكل سطر مشبوه:

1. **اذكر تفاصيل السطر:** اكتب معرّف العنصر، والتصنيف الحالي، والنص الحرفي للسطر
2. **اقتبس السياق المحيط:** اكتب الأسطر ذات الصلة التي تأتي قبل وبعد هذا السطر المشبوه
3. **طبّق فحص القواعد الحرجة:**
   - تحقق صراحة: هل يحتوي هذا السطر على اسم في سياق وصفي؟ إذا نعم، يجب أن يكون فعلاً (action)، وليس شخصية (character)
   - تحقق صراحة: هل يحتوي هذا السطر على اسم مذكور داخل حوار؟ إذا نعم، يبقى حواراً (dialogue)، وليس شخصية (character)
   - تحقق صراحة: هل يحتوي هذا السطر على نقطتين (:) بعد اسم؟ عندها فقط يمكن أن يكون شخصية (character)
4. **طبّق مخطط التصنيف الانسيابي:**
   - تحقق إذا تطابق مع نمط البسملة (basmala)
   - تحقق إذا تطابق مع أنماط ترويسة المشهد (scene_header_1، scene_header_2، أو scene_header_3)
   - تحقق إذا تطابق مع نمط الانتقال (transition)
   - تحقق إذا تطابق مع نمط التوجيه الأدائي (parenthetical)
   - تحقق إذا كان يحتوي على اسم + نقطتين للشخصية (character)
   - تحقق إذا كان يتبع سطر شخصية للحوار (dialogue)
   - إذا لم ينطبق أيّ مما سبق، صنّفه كفعل (action)
5. **اذكر قرارك:** ما هو النوع الصحيح ولماذا؟
6. **قيّم الثقة:** قيّم مستوى ثقتك (من 0 إلى 1) بناءً على مدى وضوح تطابق السطر مع القواعد

---

## صيغة الإخراج

الأوامر المسموحة:

1. relabel — تغيير أو تأكيد نوع عنصر:
   { "op": "relabel", "itemId": "...", "newType": "action", "confidence": 0.96, "reason": "سبب قصير بالعربية" }

2. split — تقسيم عنصر إلى جزأين عند موقع محدد (UTF-16 index):
   { "op": "split", "itemId": "...", "splitAt": 42, "leftType": "dialogue", "rightType": "action", "confidence": 0.92, "reason": "سبب قصير بالعربية" }

صيغة الإخراج الإلزامية (JSON فقط، لا أي نص آخر):
{
  "commands": [
    { "op": "relabel", "itemId": "abc-123", "newType": "action", "confidence": 0.96, "reason": "سبب قصير بالعربية" }
  ]
}

---

## قواعد الإخراج الإلزامية

- confidence: رقم بين 0 و 1.
- itemId: لازم يطابق المدخل بالضبط.
- يجب إرجاع أمر لكل itemId في requiredItemIds.
- أي itemId داخل forcedItemIds لا يجوز أن يبقى بلا أمر.
- ممنوع استخدام leftText أو rightText في أمر split.
- splitAt يمثل UTF-16 code-unit index.
- لا ترجع أي مفاتيح إضافية خارج المحددة.
- لو التصنيف الحالي صحيح ولا يحتاج تعديل، ارجع relabel بنفس النوع الحالي (assignedType).
- أخرج فقط JSON صالحاً، بدون أي نص آخر قبله أو بعده.

## مثال توضيحي

### مثال الإدخال

{
  "requiredItemIds": ["item-2", "item-5", "item-8", "item-9"],
  "forcedItemIds": ["item-5"],
  "suspiciousLines": [
    {"itemId": "item-2", "assignedType": "scene_header_1", "text": "مشهد 1", "contextLines": []},
    {"itemId": "item-5", "assignedType": "character", "text": "تخرج نهال من غرفتها وهي في عجلة من أمرها.", "contextLines": []},
    {"itemId": "item-8", "assignedType": "character", "text": "أخبرتني أن أحمد لن يأتي.", "contextLines": []},
    {"itemId": "item-9", "assignedType": "dialogue", "text": "(بغضب)", "contextLines": []}
  ]
}

### مثال المخرج المتوقع

{
  "commands": [
    {"op": "relabel", "itemId": "item-2", "newType": "scene_header_1", "confidence": 1.0, "reason": "التصنيف الحالي صحيح. يتطابق مع نمط 'مشهد + رقم'."},
    {"op": "relabel", "itemId": "item-5", "newType": "action", "confidence": 1.0, "reason": "هذا سطر وصفي (action). تم ذكر الاسم 'نهال' في سياق السرد وليس كمتحدث. القاعدة الحرجة تمنع تصنيفه كـ character."},
    {"op": "relabel", "itemId": "item-8", "newType": "dialogue", "confidence": 0.95, "reason": "التصنيف الحالي خاطئ. هذا السطر هو حوار يتبع شخصية غير ظاهرة في السياق. تم ذكر الاسم 'أحمد' داخل الحوار نفسه وليس كمتحدث جديد."},
    {"op": "relabel", "itemId": "item-9", "newType": "parenthetical", "confidence": 1.0, "reason": "هذا سطر توضيحي بين قوسين، يجب تصنيفه كـ parenthetical."}
  ]
}

ارجع الآن كائن JSON واحد فقط يحتوي مصفوفة commands — أمر واحد لكل itemId مطلوب. لا تكتب أي نص خارج JSON.`;

// ─────────────────────────────────────────────────────────
// بناء رسالة المستخدم لطلب المراجعة
// ─────────────────────────────────────────────────────────

/**
 * بناء رسالة المستخدم لطلب المراجعة (API v2)
 * تنسيق المدخلات مع عرض السياق المحيط بشكل واضح ومنظم
 */
const buildReviewUserPrompt = (request) => {
  const suspiciousLinesWithContext = request.suspiciousLines.map((line) => {
    const entry = {
      itemId: line.itemId,
      assignedType: line.assignedType,
      text: line.text,
      totalSuspicion: line.totalSuspicion,
    };

    if (line.reasons && line.reasons.length > 0) {
      entry.reasons = line.reasons;
    }

    if (line.contextLines && line.contextLines.length > 0) {
      entry.contextLines = line.contextLines.map((ctx) => ({
        lineIndex: ctx.lineIndex,
        assignedType: ctx.assignedType,
        text: ctx.text,
      }));
    }

    if (line.escalationScore !== undefined) {
      entry.escalationScore = line.escalationScore;
    }
    if (line.criticalMismatch !== undefined) {
      entry.criticalMismatch = line.criticalMismatch;
    }

    return entry;
  });

  const payload = {
    totalReviewed: request.totalReviewed,
    requiredItemIds: request.requiredItemIds,
    forcedItemIds: request.forcedItemIds,
    suspiciousLines: suspiciousLinesWithContext,
  };

  return `راجع الأسطر المشتبه فيها التالية. لكل سطر، حلّل السياق المحيط وطبّق قواعد التصنيف بدقة، ثم ارجع أوامر JSON فقط بالصيغة المطلوبة.

تنبيه: انتبه بشكل خاص للقواعد الحرجة:
- الأسماء في الأوصاف تبقى action وليست character
- الأسماء داخل الحوار تبقى dialogue وليست character
- character يتطلب اسم + نقطتين (:) فقط
- الأقواس () الكاملة بين character و dialogue هي parenthetical

${JSON.stringify(payload, null, 2)}`;
};

// ─────────────────────────────────────────────────────────
// تحليل أوامر الوكيل
// ─────────────────────────────────────────────────────────

const clampConfidence = (value) => {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

/**
 * تحليل أوامر المراجعة من استجابة الوكيل (API v2)
 * يدعم عمليات relabel و split
 */
export const parseReviewCommands = (rawText) => {
  const source = rawText.trim();
  if (!source) return [];

  const parseCandidate = (candidate) => {
    const parsed = JSON.parse(candidate);
    const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
    const normalized = [];

    for (const command of commands) {
      if (!command || typeof command !== "object") continue;

      const op = typeof command.op === "string" ? command.op.trim() : "";
      const itemId =
        typeof command.itemId === "string" ? command.itemId.trim() : "";
      const reasonRaw =
        typeof command.reason === "string"
          ? command.reason.trim()
          : "أمر بدون سبب مفصل";
      const confidenceRaw =
        typeof command.confidence === "number" ? command.confidence : 0.5;

      if (!itemId) continue;
      if (!["relabel", "split"].includes(op)) continue;

      const baseCommand = {
        op,
        itemId,
        confidence: clampConfidence(confidenceRaw),
        reason: reasonRaw,
      };

      if (op === "relabel") {
        const newType =
          typeof command.newType === "string" ? command.newType.trim() : "";
        if (!newType || !ALLOWED_LINE_TYPES.has(newType)) continue;
        const normalizedNewType = normalizeSceneHeaderDecisionType(newType);
        normalized.push({
          ...baseCommand,
          newType: normalizedNewType,
        });
      } else if (op === "split") {
        const splitAt =
          typeof command.splitAt === "number"
            ? Math.trunc(command.splitAt)
            : -1;
        const leftType =
          typeof command.leftType === "string" ? command.leftType.trim() : "";
        const rightType =
          typeof command.rightType === "string" ? command.rightType.trim() : "";

        if (splitAt < 0) continue;
        if (!leftType || !ALLOWED_LINE_TYPES.has(leftType)) continue;
        if (!rightType || !ALLOWED_LINE_TYPES.has(rightType)) continue;
        const normalizedLeftType = normalizeSceneHeaderDecisionType(leftType);
        const normalizedRightType = normalizeSceneHeaderDecisionType(rightType);

        normalized.push({
          ...baseCommand,
          splitAt,
          leftType: normalizedLeftType,
          rightType: normalizedRightType,
        });
      }
    }
    return normalized;
  };

  try {
    return parseCandidate(source);
  } catch {
    // محاولة استخراج JSON من النص إذا كان محاطاً بنص إضافي
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return [];
    }
    try {
      return parseCandidate(source.slice(start, end + 1));
    } catch {
      return [];
    }
  }
};

// ─────────────────────────────────────────────────────────
// تطبيع الأوامر وبناء بيانات التغطية
// ─────────────────────────────────────────────────────────

/**
 * إرجاع قائمة فريدة ومرتبة من itemIds
 */
const uniqueSortedStrings = (values) =>
  [
    ...new Set((values ?? []).filter((value) => isNonEmptyString(value))),
  ].sort();

const chooseMockRelabelType = (assignedType) =>
  assignedType === "action" ? "dialogue" : "action";

const buildMockReviewCommands = (request) => {
  const suspiciousByItemId = new Map();

  for (const line of request.suspiciousLines) {
    if (!isObjectRecord(line)) continue;
    const normalizedItemId = isNonEmptyString(line.itemId)
      ? line.itemId
      : isIntegerNumber(line.itemIndex)
        ? `item-${line.itemIndex}`
        : "";
    if (!normalizedItemId) continue;
    suspiciousByItemId.set(normalizedItemId, line);
  }

  const forcedIds = new Set(request.forcedItemIds);

  return request.requiredItemIds
    .map((itemId) => {
      const sourceLine = suspiciousByItemId.get(itemId);
      if (!sourceLine) return null;

      const shouldRelabel =
        forcedIds.has(itemId) || sourceLine.routingBand === "agent-forced";
      const newType = shouldRelabel
        ? chooseMockRelabelType(sourceLine.assignedType)
        : sourceLine.assignedType;

      return {
        op: "relabel",
        itemId,
        newType,
        confidence: 0.99,
        reason: "أمر محاكاة لاختبارات التكامل وE2E.",
      };
    })
    .filter((command) => command !== null);
};

/**
 * تطبيع الأوامر ضد الطلب (API v2)
 * إزالة الأوامر لـ itemIds غير موجودة
 * الاحتفاظ بأفضل أمر لكل itemId حسب confidence
 */
const normalizeCommandsAgainstRequest = (request, rawCommands) => {
  const allowedIds = new Set(
    request.suspiciousLines.map((line) => line.itemId)
  );
  const bestByItemId = new Map();

  for (const command of rawCommands) {
    if (!allowedIds.has(command.itemId)) continue;

    const existing = bestByItemId.get(command.itemId);
    if (!existing || command.confidence >= existing.confidence) {
      bestByItemId.set(command.itemId, command);
    }
  }

  return Array.from(bestByItemId.values()).sort((a, b) =>
    a.itemId.localeCompare(b.itemId)
  );
};

/**
 * بناء بيانات تغطية المراجعة (API v2)
 * تتبع الأوامر المفقودة والـ forced غير المحلولة
 */
const buildReviewCoverageMeta = (request, commands) => {
  const commandByItemId = new Map(
    commands.map((command) => [command.itemId, command])
  );
  const suspiciousByItemId = new Map(
    request.suspiciousLines.map((line) => [line.itemId, line])
  );

  const requiredItemIds = uniqueSortedStrings(request.requiredItemIds);
  const forcedItemIds = uniqueSortedStrings(request.forcedItemIds);

  const missingItemIds = requiredItemIds.filter(
    (itemId) => !commandByItemId.has(itemId)
  );

  const unresolvedForcedItemIds = forcedItemIds.filter((itemId) => {
    const source = suspiciousByItemId.get(itemId);
    // If the forced item wasn't even in the suspicious list, that's a data error
    if (!source) return true;

    // If the agent returned no command for this forced item, the agent
    // reviewed it and confirmed the current classification is correct.
    // This is a valid resolution — not an error.
    const command = commandByItemId.get(itemId);
    if (!command) return false;

    if (command.op === "relabel") {
      // Agent actively relabeled it (even if same type = confirmation)
      // → resolved either way
      return false;
    }
    // split يعتبر دائماً resolved
    return false;
  });

  return {
    requestedCount: requiredItemIds.length,
    commandCount: commands.length,
    missingItemIds,
    forcedItemIds,
    unresolvedForcedItemIds,
  };
};

// ─────────────────────────────────────────────────────────
// إنشاء استجابة المراجعة
// ─────────────────────────────────────────────────────────

/**
 * إنشاء استجابة المراجعة مع بيانات التغطية (API v2)
 */
const createReviewResponseWithCoverage = (
  request,
  commands,
  startedAt,
  defaultAppliedMessage,
  requestId,
  modelId
) => {
  const normalizedCommands = normalizeCommandsAgainstRequest(request, commands);
  const meta = buildReviewCoverageMeta(request, normalizedCommands);
  const latencyMs = Date.now() - startedAt;

  if (meta.unresolvedForcedItemIds.length > 0) {
    return {
      status: "error",
      model: modelId,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: normalizedCommands,
      message:
        "تعذر حسم عناصر forced المطلوبة: " +
        meta.unresolvedForcedItemIds.join(", "),
      latencyMs,
      meta,
    };
  }

  if (meta.missingItemIds.length > 0) {
    return {
      status: "partial",
      model: modelId,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: normalizedCommands,
      message:
        "الوكيل لم يُرجع أوامر كاملة لكل requiredItemIds: " +
        meta.missingItemIds.join(", "),
      latencyMs,
      meta,
    };
  }

  if (normalizedCommands.length === 0) {
    return {
      status: "skipped",
      model: modelId,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: [],
      message: "الوكيل لم يرجع أوامر قابلة للتطبيق.",
      latencyMs,
      meta,
    };
  }

  return {
    status: "applied",
    model: modelId,
    apiVersion: AGENT_API_VERSION,
    mode: AGENT_API_MODE,
    importOpId: request.importOpId,
    requestId,
    commands: normalizedCommands,
    message: defaultAppliedMessage,
    latencyMs,
    meta,
  };
};

// ─────────────────────────────────────────────────────────
// الدالة الرئيسية: مراجعة السطور المشتبه فيها
// ─────────────────────────────────────────────────────────

/**
 * محاولة إرسال طلب لـ Claude عبر SDK ثم REST fallback.
 * ترجع النتيجة أو ترمي error.
 */
const tryCallAnthropicOnce = async (params, reviewRuntime, anthropicApiKey) => {
  try {
    const message = await tryCreateMessageWithSdk(params);
    return {
      source: "sdk",
      content: message.content,
      stopReason: message.stop_reason ?? null,
    };
  } catch (sdkError) {
    logger.warn({ err: sdkError }, "فشل SDK في المراجعة، تجربة REST fallback");
    // لو الـ SDK فشل بـ overload، نحاول REST مرة واحدة
    const response = await axios.post(reviewRuntime.messagesEndpoint, params, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": reviewRuntime.apiVersion,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const responseContent = Array.isArray(response?.data?.content)
      ? response.data.content
      : [];
    const stopReason =
      typeof response?.data?.stop_reason === "string"
        ? response.data.stop_reason
        : null;
    return { source: "rest", content: responseContent, stopReason };
  }
};

/**
 * مراجعة السطور المشتبه فيها مع Claude (API v2)
 * الاستراتيجية:
 * 1. حاول الموديل الأساسي مع retry + exponential backoff
 * 2. لو كل المحاولات فشلت بـ overload → حاول fallback model (Sonnet)
 * 3. لو كله فشل → ارجع error مع HTTP status مناسب (providerStatusCode)
 */
export const reviewSuspiciousLinesWithClaude = async (request) => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const emptyMeta = buildReviewCoverageMeta(request, []);
  const mockMode = resolveAgentReviewMockMode();
  const reviewRuntime = resolveAnthropicReviewRuntime();
  const reviewModel = reviewRuntime.resolvedModel;
  logReviewModelFallbackOnce(reviewRuntime);

  if (mockMode === "error") {
    return {
      status: "error",
      model: reviewModel,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: [],
      message: "AGENT_REVIEW_MOCK_MODE=error",
      latencyMs: Date.now() - startedAt,
      meta: emptyMeta,
    };
  }

  if (mockMode === "success") {
    const commands = buildMockReviewCommands(request);
    return createReviewResponseWithCoverage(
      request,
      commands,
      startedAt,
      `تمت محاكاة ${commands.length} أمر للمراجعة.`,
      requestId,
      reviewModel
    );
  }

  const keyValidation = validateAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  if (!keyValidation.valid) {
    const hasUnresolvedForced = emptyMeta.unresolvedForcedItemIds.length > 0;
    return {
      status: hasUnresolvedForced ? "error" : "partial",
      model: reviewModel,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: [],
      message: `${keyValidation.message} لا يمكن تشغيل مراجعة الوكيل.`,
      latencyMs: Date.now() - startedAt,
      meta: emptyMeta,
    };
  }
  const anthropicApiKey = keyValidation.apiKey;

  if (
    !Array.isArray(request.suspiciousLines) ||
    request.suspiciousLines.length === 0
  ) {
    return {
      status: "skipped",
      model: reviewModel,
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
      importOpId: request.importOpId,
      requestId,
      commands: [],
      message: "لا توجد سطور مشتبه فيها لإرسالها للوكيل.",
      latencyMs: Date.now() - startedAt,
      meta: emptyMeta,
    };
  }

  const computeMaxTokens = (boostFactor = 1) =>
    Math.min(
      PRACTICAL_MAX_OUTPUT,
      Math.max(
        1200,
        Math.ceil(
          (BASE_OUTPUT_TOKENS +
            request.suspiciousLines.length * TOKENS_PER_SUSPICIOUS_LINE) *
            boostFactor
        )
      )
    );

  let maxTokens = computeMaxTokens(1);

  // ─── الاستراتيجية: primary model → retry with backoff → fallback model ───
  const modelsToTry = [reviewModel];
  // أضف fallback model فقط إذا كان مختلف عن الأساسي
  if (FALLBACK_MODEL_ID && FALLBACK_MODEL_ID !== reviewModel) {
    modelsToTry.push(FALLBACK_MODEL_ID);
  }

  let lastError = null;
  let lastProviderStatus = null;

  for (const currentModel of modelsToTry) {
    const isFallback = currentModel !== reviewModel;

    for (let attempt = 1; attempt <= OVERLOAD_MAX_RETRIES; attempt += 1) {
      const params = buildAnthropicMessageParams(
        request,
        maxTokens,
        currentModel
      );
      try {
        const result = await tryCallAnthropicOnce(
          params,
          reviewRuntime,
          anthropicApiKey
        );
        const text = extractTextFromAnthropicBlocks(result.content);
        const commands = parseReviewCommands(text);

        // ─── كشف اقتطاع الاستجابة بسبب max_tokens ───
        // إذا انتهى الوكيل بسبب max_tokens و لم يُرجع أي أوامر صالحة،
        // فهذا يعني أن التحليل استنزف الميزانية قبل كتابة JSON.
        // نعيد المحاولة بميزانية أعلى (× 2) مع نفس الموديل.
        if (
          result.stopReason === "max_tokens" &&
          commands.length === 0 &&
          attempt < OVERLOAD_MAX_RETRIES
        ) {
          const boostedBudget = computeMaxTokens(2);
          logger.warn(
            {
              model: currentModel,
              attempt,
              stopReason: result.stopReason,
              previousMaxTokens: maxTokens,
              boostedMaxTokens: boostedBudget,
            },
            `الاستجابة اقتُطعت (stop_reason=max_tokens) بدون أوامر — إعادة المحاولة بميزانية أعلى`
          );
          maxTokens = boostedBudget;
          continue;
        }

        const suffix = isFallback ? " (fallback model)" : "";
        const sourceLabel = result.source === "rest" ? " (REST)" : "";
        if (isFallback) {
          logger.info(
            { model: currentModel, attempt },
            `نجح الموديل البديل ${currentModel}`
          );
        }
        return createReviewResponseWithCoverage(
          request,
          commands,
          startedAt,
          `تم استلام ${commands.length} أمر${sourceLabel}${suffix}.`,
          requestId,
          currentModel
        );
      } catch (err) {
        lastError = err;
        const overload = isOverloadError(err) || isOverloadAxiosError(err);
        const providerInfo = resolveProviderErrorInfo(err);
        lastProviderStatus = providerInfo.status;

        logger.warn(
          {
            model: currentModel,
            attempt,
            maxAttempts: OVERLOAD_MAX_RETRIES,
            overload,
            isFallback,
            status: providerInfo.status,
            message: providerInfo.message,
          },
          `فشلت المحاولة ${attempt}/${OVERLOAD_MAX_RETRIES} للموديل ${currentModel}`
        );

        if (!overload) {
          // خطأ غير overload — لا فائدة من retry
          break;
        }

        if (attempt < OVERLOAD_MAX_RETRIES) {
          const delay =
            OVERLOAD_BASE_DELAY_MS *
            Math.pow(OVERLOAD_BACKOFF_MULTIPLIER, attempt - 1);
          logger.info(
            { delay, attempt, model: currentModel },
            `انتظار ${delay}ms قبل المحاولة التالية...`
          );
          await sleep(delay);
        }
      }
    }

    // كل محاولات هذا الموديل فشلت
    if (!isFallback && modelsToTry.length > 1) {
      logger.warn(
        { model: currentModel, fallback: FALLBACK_MODEL_ID },
        `كل محاولات ${currentModel} فشلت، التحويل إلى الموديل البديل ${FALLBACK_MODEL_ID}`
      );
    }
  }

  // كل الموديلات فشلت
  const providerInfo = resolveProviderErrorInfo(lastError);
  return {
    status: "error",
    model: reviewModel,
    apiVersion: AGENT_API_VERSION,
    mode: AGENT_API_MODE,
    importOpId: request.importOpId,
    requestId,
    commands: [],
    message: `فشل الوكيل: ${providerInfo.message}${
      providerInfo.requestId ? ` (request_id=${providerInfo.requestId})` : ""
    }`,
    latencyMs: Date.now() - startedAt,
    meta: emptyMeta,
    // حقل جديد: status code من الـ provider لتمريره للكلاينت
    providerStatusCode: lastProviderStatus,
  };
};

export const buildAnthropicMessageParams = (request, maxTokens, modelId) => ({
  model: isNonEmptyString(modelId)
    ? modelId.trim()
    : resolveAnthropicReviewRuntime().resolvedModel,
  max_tokens: maxTokens,
  temperature: REVIEW_TEMPERATURE,
  system: REVIEW_SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: buildReviewUserPrompt(request),
    },
  ],
});

// ─────────────────────────────────────────────────────────
// الصادرات العامة
// ─────────────────────────────────────────────────────────

export const requestAnthropicReview = reviewSuspiciousLinesWithClaude;
export const getAnthropicReviewRuntime = () => resolveAnthropicReviewRuntime();
export const getAnthropicReviewModel = () =>
  resolveAnthropicReviewRuntime().resolvedModel;
