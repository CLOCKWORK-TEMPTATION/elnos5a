import { config } from "dotenv";
import { randomUUID } from "crypto";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import pino from "pino";
import {
  invokeWithFallback,
  resolveProviderErrorInfo,
} from "./langchain-fallback-chain.mjs";
import {
  logReviewChannelStartupWarnings,
  resolveReviewChannelConfig,
} from "./provider-config.mjs";
import {
  getReviewRuntimeSnapshot,
  updateReviewRuntimeSnapshot,
} from "./provider-api-runtime.mjs";

config();

// ─────────────────────────────────────────────────────────
// الثوابت
// ─────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";
const TEMPERATURE = 0.0;
const DEFAULT_TIMEOUT_MS = 180_000;
const API_VERSION = "2.0";
const API_MODE = "auto-apply";

// Token budget
const BASE_OUTPUT_TOKENS = 1200;
const TOKENS_PER_SUSPICIOUS_LINE = 1000;
const MAX_TOKENS_CEILING = 64000;

// Validation
const MAX_PACKET_VERSION_LENGTH = 64;
const MAX_SCHEMA_VERSION_LENGTH = 64;
const MAX_SESSION_ID_LENGTH = 120;
const MAX_IMPORT_OP_ID_LENGTH = 120;
const MAX_REVIEW_PACKET_TEXT_LENGTH = 160_000;
const MAX_ITEM_ID_LENGTH = 120;
const MAX_TEXT_LENGTH = 8_000;
const MAX_FINGERPRINT_LENGTH = 256;
const MAX_REASON_CODES = 32;
const MAX_SIGNAL_MESSAGES = 32;

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

const logger = pino({ name: "final-review" });
logReviewChannelStartupWarnings(logger, "final-review");
const FINAL_REVIEW_CHANNEL = "final-review";

const getFinalReviewConfig = (env = process.env) =>
  resolveReviewChannelConfig(FINAL_REVIEW_CHANNEL, env);

const resolveFinalReviewRuntime = (env = process.env) => {
  const snapshot = getReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, env);
  return {
    provider: snapshot.activeProvider ?? snapshot.resolvedProvider,
    requestedModel: snapshot.requestedModel,
    resolvedModel: snapshot.resolvedModel,
    resolvedSpecifier: snapshot.resolvedSpecifier,
    fallbackApplied: snapshot.usedFallback,
    fallbackReason: snapshot.fallbackReason,
    fallbackModel: snapshot.fallbackModel,
    fallbackSpecifier: snapshot.fallbackSpecifier,
    baseUrl: snapshot.apiBaseUrl,
    apiVersion: snapshot.apiVersion,
    configured: snapshot.configured,
    warnings: [...snapshot.credentialWarnings],
  };
};

// ─────────────────────────────────────────────────────────
// القيم الافتراضية للمخطط
// ─────────────────────────────────────────────────────────

const DEFAULT_SCHEMA_HINTS = {
  allowedLineTypes: [...ALLOWED_LINE_TYPES],
  lineTypeDescriptions: {
    action: "وصف الحدث والمشهد",
    dialogue: "نص الحوار المنطوق",
    character: "اسم الشخصية فوق الحوار",
    scene_header_1: "رأس المشهد الرئيسي",
    scene_header_2: "رأس المشهد الفرعي",
    scene_header_3: "وصف زمني أو مكاني للمشهد",
    transition: "انتقال بين المشاهد",
    parenthetical: "توجيه أدائي بين قوسين",
    basmala: "البسملة في بداية المستند",
  },
  gateRules: [],
};

// ─────────────────────────────────────────────────────────
// أدوات مساعدة
// ─────────────────────────────────────────────────────────

const isObjectRecord = (value) => typeof value === "object" && value !== null;

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isIntegerNumber = (value) => Number.isInteger(value) && value >= 0;

const normalizeIncomingText = (value, maxLength = 50_000) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

// ─────────────────────────────────────────────────────────
// T009 partial — تطبيع نوع scene_header في قرارات الوكيل
// ─────────────────────────────────────────────────────────

/**
 * في final-review، نُطبّع scene_header_1/2 إلى scene_header_top_line
 * (عكس agent-review الذي يُطبّع scene_header_top_line → scene_header_1)
 */
const normalizeSceneHeaderDecisionType = (lineType) => {
  if (lineType === "scene_header_1" || lineType === "scene_header_2") {
    return "scene_header_top_line";
  }
  return lineType;
};

// ─────────────────────────────────────────────────────────
// خطأ التحقق
// ─────────────────────────────────────────────────────────

export class FinalReviewValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FinalReviewValidationError";
    this.statusCode = 400;
  }
}

// ─────────────────────────────────────────────────────────
// T016 — التحقق من صحة جسم الطلب
// ─────────────────────────────────────────────────────────

export const validateFinalReviewRequestBody = (body) => {
  if (!isObjectRecord(body)) {
    throw new FinalReviewValidationError(
      "Invalid final-review request body: must be a JSON object."
    );
  }

  // packetVersion
  const packetVersion = normalizeIncomingText(
    body.packetVersion,
    MAX_PACKET_VERSION_LENGTH
  );
  if (!isNonEmptyString(packetVersion)) {
    throw new FinalReviewValidationError(
      "Missing or invalid packetVersion: must be a non-empty string (max 64 chars)."
    );
  }

  // schemaVersion
  const schemaVersion = normalizeIncomingText(
    body.schemaVersion,
    MAX_SCHEMA_VERSION_LENGTH
  );
  if (!isNonEmptyString(schemaVersion)) {
    throw new FinalReviewValidationError(
      "Missing or invalid schemaVersion: must be a non-empty string (max 64 chars)."
    );
  }

  // sessionId
  const sessionId = normalizeIncomingText(
    body.sessionId,
    MAX_SESSION_ID_LENGTH
  );
  if (!isNonEmptyString(sessionId)) {
    throw new FinalReviewValidationError(
      "Missing or invalid sessionId: must be a non-empty string (max 120 chars)."
    );
  }

  // importOpId
  const importOpId = normalizeIncomingText(
    body.importOpId,
    MAX_IMPORT_OP_ID_LENGTH
  );
  if (!isNonEmptyString(importOpId)) {
    throw new FinalReviewValidationError(
      "Missing or invalid importOpId: must be a non-empty string (max 120 chars)."
    );
  }

  // totalReviewed
  if (!isIntegerNumber(body.totalReviewed)) {
    throw new FinalReviewValidationError(
      "Invalid totalReviewed: must be a non-negative integer."
    );
  }
  const totalReviewed = body.totalReviewed;

  // suspiciousLines
  if (!Array.isArray(body.suspiciousLines)) {
    throw new FinalReviewValidationError(
      "Invalid suspiciousLines: must be an array."
    );
  }

  const seenItemIds = new Set();
  const suspiciousLines = body.suspiciousLines.map((entry, index) => {
    if (!isObjectRecord(entry)) {
      throw new FinalReviewValidationError(
        `Invalid suspicious line at index ${index}: must be an object.`
      );
    }

    // itemId
    const itemId = normalizeIncomingText(entry.itemId, MAX_ITEM_ID_LENGTH);
    if (!isNonEmptyString(itemId)) {
      throw new FinalReviewValidationError(
        `Invalid itemId at suspicious line ${index}: must be a non-empty string.`
      );
    }
    if (seenItemIds.has(itemId)) {
      throw new FinalReviewValidationError(
        `Duplicate itemId "${itemId}" at suspicious line ${index}.`
      );
    }
    seenItemIds.add(itemId);

    // suspicionScore
    const suspicionScore = entry.suspicionScore;
    if (
      typeof suspicionScore !== "number" ||
      !Number.isFinite(suspicionScore) ||
      suspicionScore < 0 ||
      suspicionScore > 100
    ) {
      throw new FinalReviewValidationError(
        `Invalid suspicionScore at suspicious line ${index} (itemId="${itemId}"): must be a number 0-100.`
      );
    }

    // assignedType
    const assignedType = normalizeIncomingText(entry.assignedType, 64);
    if (!ALLOWED_LINE_TYPES.has(assignedType)) {
      throw new FinalReviewValidationError(
        `Invalid assignedType "${assignedType}" at suspicious line ${index} (itemId="${itemId}").`
      );
    }

    // routingBand
    const routingBand = normalizeIncomingText(entry.routingBand, 32);
    if (!ALLOWED_ROUTING_BANDS.has(routingBand)) {
      throw new FinalReviewValidationError(
        `Invalid routingBand "${routingBand}" at suspicious line ${index} (itemId="${itemId}"): must be "agent-candidate" or "agent-forced".`
      );
    }

    // text
    const text = normalizeIncomingText(entry.text, MAX_TEXT_LENGTH);
    if (!isNonEmptyString(text)) {
      throw new FinalReviewValidationError(
        `Empty text at suspicious line ${index} (itemId="${itemId}").`
      );
    }

    // fingerprint (optional)
    const fingerprint =
      normalizeIncomingText(entry.fingerprint, MAX_FINGERPRINT_LENGTH) ||
      undefined;

    // lineIndex (optional)
    const lineIndex =
      typeof entry.lineIndex === "number" && isIntegerNumber(entry.lineIndex)
        ? entry.lineIndex
        : undefined;

    // critical (optional boolean)
    const critical =
      typeof entry.critical === "boolean" ? entry.critical : undefined;

    // primarySuggestedType (optional)
    const primarySuggestedType =
      typeof entry.primarySuggestedType === "string" &&
      ALLOWED_LINE_TYPES.has(entry.primarySuggestedType.trim())
        ? entry.primarySuggestedType.trim()
        : undefined;

    // reasonCodes (optional array of strings, max MAX_REASON_CODES)
    const reasonCodes = Array.isArray(entry.reasonCodes)
      ? entry.reasonCodes
          .filter((r) => isNonEmptyString(r))
          .slice(0, MAX_REASON_CODES)
      : undefined;

    // signalMessages (optional array of strings, max MAX_SIGNAL_MESSAGES)
    const signalMessages = Array.isArray(entry.signalMessages)
      ? entry.signalMessages
          .filter((m) => isNonEmptyString(m))
          .slice(0, MAX_SIGNAL_MESSAGES)
      : undefined;

    // evidence (optional)
    const evidence = isObjectRecord(entry.evidence)
      ? entry.evidence
      : undefined;

    // contextLines (optional array)
    const contextLines = Array.isArray(entry.contextLines)
      ? entry.contextLines
          .filter((cl) => isObjectRecord(cl))
          .map((cl) => ({
            lineIndex:
              typeof cl.lineIndex === "number" && isIntegerNumber(cl.lineIndex)
                ? cl.lineIndex
                : undefined,
            assignedType:
              typeof cl.assignedType === "string" &&
              ALLOWED_LINE_TYPES.has(cl.assignedType.trim())
                ? cl.assignedType.trim()
                : undefined,
            text: normalizeIncomingText(cl.text, 4000) || undefined,
          }))
      : undefined;

    return {
      itemId,
      suspicionScore,
      assignedType,
      routingBand,
      text,
      fingerprint,
      lineIndex,
      critical,
      primarySuggestedType,
      reasonCodes,
      signalMessages,
      evidence,
      contextLines,
    };
  });

  // requiredItemIds — default to all suspicious line itemIds
  let requiredItemIds;
  if (Array.isArray(body.requiredItemIds)) {
    requiredItemIds = [];
    for (let i = 0; i < body.requiredItemIds.length; i++) {
      const id = body.requiredItemIds[i];
      if (!isNonEmptyString(id)) {
        throw new FinalReviewValidationError(
          `Invalid requiredItemIds entry at index ${i}: must be a non-empty string.`
        );
      }
      requiredItemIds.push(id);
    }
    requiredItemIds = [...new Set(requiredItemIds)];
  } else {
    requiredItemIds = suspiciousLines.map((l) => l.itemId);
  }

  // forcedItemIds — default to itemIds with routingBand "agent-forced"
  let forcedItemIds;
  if (Array.isArray(body.forcedItemIds)) {
    forcedItemIds = [];
    for (let i = 0; i < body.forcedItemIds.length; i++) {
      const id = body.forcedItemIds[i];
      if (!isNonEmptyString(id)) {
        throw new FinalReviewValidationError(
          `Invalid forcedItemIds entry at index ${i}: must be a non-empty string.`
        );
      }
      forcedItemIds.push(id);
    }
    forcedItemIds = [...new Set(forcedItemIds)];
  } else {
    forcedItemIds = [
      ...new Set(
        suspiciousLines
          .filter((l) => l.routingBand === "agent-forced")
          .map((l) => l.itemId)
      ),
    ];
  }

  // Verify forcedItemIds ⊆ requiredItemIds
  const requiredSet = new Set(requiredItemIds);
  for (const id of forcedItemIds) {
    if (!requiredSet.has(id)) {
      throw new FinalReviewValidationError(
        `forcedItemIds must be a subset of requiredItemIds: "${id}" is not in requiredItemIds.`
      );
    }
  }

  // Verify all requiredItemIds exist in suspiciousLines
  for (const id of requiredItemIds) {
    if (!seenItemIds.has(id)) {
      throw new FinalReviewValidationError(
        `requiredItemIds contains unknown itemId: "${id}" not found in suspiciousLines.`
      );
    }
  }

  // schemaHints — fall back to DEFAULT_SCHEMA_HINTS if invalid
  let schemaHints = DEFAULT_SCHEMA_HINTS;
  if (isObjectRecord(body.schemaHints)) {
    const hints = body.schemaHints;
    const allowedLineTypes =
      Array.isArray(hints.allowedLineTypes) &&
      hints.allowedLineTypes.every((t) => typeof t === "string")
        ? hints.allowedLineTypes.filter((t) => t.trim().length > 0)
        : DEFAULT_SCHEMA_HINTS.allowedLineTypes;

    const lineTypeDescriptions = isObjectRecord(hints.lineTypeDescriptions)
      ? hints.lineTypeDescriptions
      : DEFAULT_SCHEMA_HINTS.lineTypeDescriptions;

    const gateRules =
      Array.isArray(hints.gateRules) &&
      hints.gateRules.every((r) => isObjectRecord(r))
        ? hints.gateRules
        : DEFAULT_SCHEMA_HINTS.gateRules;

    schemaHints = { allowedLineTypes, lineTypeDescriptions, gateRules };
  }

  // reviewPacketText (optional)
  const reviewPacketText =
    normalizeIncomingText(
      body.reviewPacketText,
      MAX_REVIEW_PACKET_TEXT_LENGTH
    ) || undefined;

  return {
    packetVersion,
    schemaVersion,
    sessionId,
    importOpId,
    totalReviewed,
    suspiciousLines,
    requiredItemIds,
    forcedItemIds,
    schemaHints,
    reviewPacketText,
  };
};

// ─────────────────────────────────────────────────────────
// T010 — بناء الـ System Prompt
// ─────────────────────────────────────────────────────────

const buildSystemPrompt = (schemaHints) => {
  const allowedTypes = schemaHints.allowedLineTypes;
  const descriptions = schemaHints.lineTypeDescriptions ?? {};
  const gateRules = schemaHints.gateRules ?? [];

  // بناء قائمة الأنواع مع أوصافها
  const typesList = allowedTypes
    .map((t) => {
      const desc = descriptions[t];
      return desc ? `- ${t} — ${desc}` : `- ${t}`;
    })
    .join("\n");

  // بناء قسم قواعد الـ gate إذا وُجدت
  const gateRulesSection =
    gateRules.length > 0
      ? `\n## قواعد إضافية من المخطط\n\n${gateRules.map((r) => `- [${r.lineType}] ${r.ruleId}: ${r.description}`).join("\n")}`
      : "";

  return `أنت وكيل متخصص في المراجعة النهائية وإعادة تصنيف عناصر السيناريو العربي. مهمتك الوحيدة هي استقبال الأسطر التي يُحتمل أنها صُنّفت خطأً من نظام كشف الشكوك، واتخاذ القرارات النهائية بشأن أنواع عناصرها الصحيحة.

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

يُسمح لك فقط بتصنيف الأسطر كأحد هذه الأنواع:

${typesList}

لا يُسمح بأي أنواع أخرى خارج هذه القائمة.

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
- ترويسة مشهد (1 أو 2 أو 3)
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
6. **استخدم الأنواع المسموحة فقط:** استخدم الأنواع المذكورة أعلاه فقط.
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

ارجع الآن كائن JSON واحد فقط يحتوي مصفوفة commands — أمر واحد لكل itemId مطلوب. لا تكتب أي نص خارج JSON.${gateRulesSection}`;
};

// ─────────────────────────────────────────────────────────
// T008 — تحليل استجابة المراجعة النهائية
// ─────────────────────────────────────────────────────────

const parseFinalReviewResponse = (text) => {
  if (!text || typeof text !== "string") return [];
  let parsed;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    // Fallback: extract from first { to last }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  // Handle both array and {commands: [...]} formats
  const commands = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.commands)
      ? parsed.commands
      : [];
  return commands.filter(
    (cmd) => isObjectRecord(cmd) && (cmd.op === "relabel" || cmd.op === "split")
  );
};

// ─────────────────────────────────────────────────────────
// T009 — تطبيع الأوامر ضد الطلب
// ─────────────────────────────────────────────────────────

const normalizeCommandsAgainstRequest = (commands, request) => {
  const validItemIds = new Set(request.suspiciousLines.map((l) => l.itemId));
  const bestByItemId = new Map();
  for (const cmd of commands) {
    if (!cmd.itemId || !validItemIds.has(cmd.itemId)) continue;
    const existing = bestByItemId.get(cmd.itemId);
    if (!existing || (cmd.confidence ?? 0) > (existing.confidence ?? 0)) {
      const normalized = { ...cmd };
      if (cmd.op === "relabel" && cmd.newType) {
        normalized.newType = normalizeSceneHeaderDecisionType(cmd.newType);
      }
      if (cmd.op === "split") {
        if (cmd.leftType)
          normalized.leftType = normalizeSceneHeaderDecisionType(cmd.leftType);
        if (cmd.rightType)
          normalized.rightType = normalizeSceneHeaderDecisionType(
            cmd.rightType
          );
      }
      bestByItemId.set(cmd.itemId, normalized);
    }
  }
  return [...bestByItemId.values()];
};

// ─────────────────────────────────────────────────────────
// T028 — تحديد حالة التغطية
// ─────────────────────────────────────────────────────────

const determineCoverageStatus = (commands, request) => {
  const resolvedItemIds = commands.map((c) => c.itemId);
  const resolvedSet = new Set(resolvedItemIds);
  const missingItemIds = request.requiredItemIds.filter(
    (id) => !resolvedSet.has(id)
  );
  const unresolvedForcedItemIds = request.forcedItemIds.filter(
    (id) => !resolvedSet.has(id)
  );

  let status;
  if (unresolvedForcedItemIds.length > 0) {
    status = "error";
  } else if (missingItemIds.length === 0) {
    status = "applied";
  } else {
    status = "partial";
  }

  return { status, resolvedItemIds, missingItemIds, unresolvedForcedItemIds };
};

// ─────────────────────────────────────────────────────────
// T011 — وضع المحاكاة (Mock Mode)
// ─────────────────────────────────────────────────────────

const resolveFinalReviewMockMode = () => {
  const value = normalizeIncomingText(
    process.env.FINAL_REVIEW_MOCK_MODE,
    32
  ).toLowerCase();
  if (value === "success" || value === "error") return value;
  return null;
};

const buildFinalReviewMessages = (request) => {
  const systemPrompt = buildSystemPrompt(request.schemaHints);
  const userMessage = JSON.stringify({
    suspiciousLines: request.suspiciousLines.map((line) => ({
      itemId: line.itemId,
      lineIndex: line.lineIndex,
      text: line.text,
      assignedType: line.assignedType,
      suspicionScore: line.suspicionScore,
      routingBand: line.routingBand,
      critical: line.critical,
      primarySuggestedType: line.primarySuggestedType,
      reasonCodes: line.reasonCodes,
      signalMessages: line.signalMessages,
      evidence: line.evidence,
      contextLines: line.contextLines,
    })),
    requiredItemIds: request.requiredItemIds,
    forcedItemIds: request.forcedItemIds,
  });

  return [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];
};

const computeFinalReviewMaxTokens = (request, boostFactor = 1) =>
  Math.min(
    MAX_TOKENS_CEILING,
    Math.max(
      BASE_OUTPUT_TOKENS,
      Math.ceil(
        (BASE_OUTPUT_TOKENS +
          request.suspiciousLines.length * TOKENS_PER_SUSPICIOUS_LINE) *
          boostFactor
      )
    )
  );

const buildFinalReviewMeta = ({
  coverage,
  inputTokens = null,
  outputTokens = null,
  retryCount = 0,
  isMockResponse = false,
}) => ({
  totalInputTokens: inputTokens,
  totalOutputTokens: outputTokens,
  retryCount,
  resolvedItemIds: coverage.resolvedItemIds,
  missingItemIds: coverage.missingItemIds,
  isMockResponse,
});

const buildFinalReviewMockResponse = (
  request,
  mockMode,
  startTime,
  modelId
) => {
  const requestId = randomUUID();

  if (mockMode === "error") {
    const coverage = determineCoverageStatus([], request);
    return {
      apiVersion: API_VERSION,
      mode: API_MODE,
      importOpId: request.importOpId,
      requestId,
      status: coverage.status,
      commands: [],
      message: "FINAL_REVIEW_MOCK_MODE=error",
      latencyMs: Date.now() - startTime,
      model: modelId,
      meta: buildFinalReviewMeta({
        coverage,
        isMockResponse: true,
      }),
    };
  }

  const commands = request.requiredItemIds.map((itemId) => {
    const line = request.suspiciousLines.find(
      (entry) => entry.itemId === itemId
    );
    return {
      op: "relabel",
      itemId,
      newType: line?.assignedType ?? "action",
      confidence: 0.99,
      reason: "Mock: confirmed by mock mode.",
    };
  });
  const coverage = determineCoverageStatus(commands, request);

  return {
    apiVersion: API_VERSION,
    mode: API_MODE,
    importOpId: request.importOpId,
    requestId,
    status: coverage.status,
    commands,
    message: `Mock success: ${commands.length} commands generated.`,
    latencyMs: Date.now() - startTime,
    model: modelId,
    meta: buildFinalReviewMeta({
      coverage,
      isMockResponse: true,
    }),
  };
};

export const requestFinalReview = async (body) => {
  const startTime = Date.now();
  const request = validateFinalReviewRequestBody(body);
  const requestId = randomUUID();
  const config = getFinalReviewConfig();
  const reviewModel = config.resolvedModel ?? DEFAULT_MODEL_ID;
  const mockMode = resolveFinalReviewMockMode();

  updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
    activeProvider: config.resolvedProvider,
    activeModel: reviewModel,
    activeSpecifier: config.resolvedSpecifier,
    usedFallback: false,
    fallbackReason: null,
    lastStatus: "running",
    lastErrorClass: null,
    lastErrorMessage: null,
    lastProviderStatusCode: null,
    retryCount: 0,
    latencyMs: null,
    lastInvocationAt: Date.now(),
  });

  if (mockMode) {
    const response = buildFinalReviewMockResponse(
      request,
      mockMode,
      startTime,
      reviewModel
    );
    updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
      lastStatus: response.status,
      lastErrorClass: mockMode === "error" ? "mock" : null,
      lastErrorMessage:
        mockMode === "error" ? "FINAL_REVIEW_MOCK_MODE=error" : null,
      retryCount: 0,
      latencyMs: response.latencyMs,
      lastSuccessAt: mockMode === "success" ? Date.now() : null,
      lastFailureAt: mockMode === "error" ? Date.now() : null,
    });
    return response;
  }

  if (request.suspiciousLines.length === 0) {
    const latencyMs = Date.now() - startTime;
    updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
      lastStatus: "skipped",
      retryCount: 0,
      latencyMs,
      lastSuccessAt: Date.now(),
    });
    return {
      apiVersion: API_VERSION,
      mode: API_MODE,
      importOpId: request.importOpId,
      requestId,
      status: "skipped",
      commands: [],
      message: "No suspicious lines to review.",
      latencyMs,
      model: reviewModel,
      meta: buildFinalReviewMeta({
        coverage: determineCoverageStatus([], request),
      }),
    };
  }

  const configError =
    (!config.primary?.valid && config.primary?.error) ||
    (!config.primary?.credential?.valid &&
      config.primary?.credential?.message) ||
    null;

  if (configError) {
    const coverage = determineCoverageStatus([], request);
    const latencyMs = Date.now() - startTime;
    updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
      lastStatus: coverage.status,
      lastErrorClass: "configuration",
      lastErrorMessage: configError,
      retryCount: 0,
      latencyMs,
      lastFailureAt: Date.now(),
    });
    return {
      apiVersion: API_VERSION,
      mode: API_MODE,
      importOpId: request.importOpId,
      requestId,
      status: coverage.status,
      commands: [],
      message: configError,
      latencyMs,
      model: reviewModel,
      meta: buildFinalReviewMeta({ coverage }),
    };
  }

  const messages = buildFinalReviewMessages(request);

  for (const boostFactor of [1, 2]) {
    const maxTokens = computeFinalReviewMaxTokens(request, boostFactor);
    try {
      const invocation = await invokeWithFallback({
        channel: FINAL_REVIEW_CHANNEL,
        primaryTarget: config.primary,
        fallbackTarget: config.fallback,
        messages,
        temperature: TEMPERATURE,
        maxTokens,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        logger,
      });

      const rawCommands = parseFinalReviewResponse(invocation.text);
      const commands = normalizeCommandsAgainstRequest(rawCommands, request);
      if (
        invocation.stopReason === "max_tokens" &&
        commands.length === 0 &&
        boostFactor === 1
      ) {
        logger.warn(
          {
            channel: FINAL_REVIEW_CHANNEL,
            provider: invocation.provider,
            model: invocation.model,
            maxTokens,
          },
          "final review response reached max tokens without parseable commands"
        );
        continue;
      }

      const coverage = determineCoverageStatus(commands, request);
      const response = {
        apiVersion: API_VERSION,
        mode: API_MODE,
        importOpId: request.importOpId,
        requestId,
        status: coverage.status,
        commands,
        message:
          coverage.status === "applied"
            ? `All ${commands.length} items resolved.`
            : coverage.status === "partial"
              ? `${commands.length} of ${request.requiredItemIds.length} items resolved.`
              : `${coverage.unresolvedForcedItemIds.length} forced items unresolved.`,
        latencyMs: Date.now() - startTime,
        model: invocation.model,
        meta: buildFinalReviewMeta({
          coverage,
          inputTokens: invocation.inputTokens,
          outputTokens: invocation.outputTokens,
          retryCount: invocation.retryCount,
        }),
      };

      updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
        activeProvider: invocation.provider,
        activeModel: invocation.model,
        activeSpecifier: invocation.requestedSpecifier,
        usedFallback: invocation.usedFallback,
        fallbackReason: invocation.usedFallback
          ? "temporary-primary-failure"
          : null,
        lastStatus: response.status,
        lastErrorClass: null,
        lastErrorMessage: null,
        lastProviderStatusCode: null,
        retryCount: invocation.retryCount,
        latencyMs: response.latencyMs,
        lastSuccessAt: Date.now(),
      });

      logger.info(
        {
          channel: FINAL_REVIEW_CHANNEL,
          provider: invocation.provider,
          model: invocation.model,
          usedFallback: invocation.usedFallback,
          retryCount: invocation.retryCount,
          latencyMs: response.latencyMs,
        },
        "final review completed"
      );

      return response;
    } catch (error) {
      const providerInfo = resolveProviderErrorInfo(error);
      const latencyMs = Date.now() - startTime;
      updateReviewRuntimeSnapshot(FINAL_REVIEW_CHANNEL, {
        activeProvider: error?.provider ?? config.resolvedProvider,
        activeModel: error?.model ?? reviewModel,
        activeSpecifier: error?.specifier ?? config.resolvedSpecifier,
        usedFallback: Boolean(
          config.fallback?.usable &&
          error?.specifier &&
          config.fallback.specifier === error.specifier
        ),
        fallbackReason:
          config.fallback?.usable &&
          error?.specifier &&
          config.fallback.specifier === error.specifier
            ? "fallback-exhausted"
            : null,
        lastStatus: "error",
        lastErrorClass: providerInfo.temporary
          ? "temporary-provider-error"
          : "provider-error",
        lastErrorMessage: providerInfo.message,
        lastProviderStatusCode: providerInfo.status ?? null,
        retryCount:
          typeof error?.retryCount === "number" ? error.retryCount : 0,
        latencyMs,
        lastFailureAt: Date.now(),
      });

      logger.error(
        {
          channel: FINAL_REVIEW_CHANNEL,
          provider: error?.provider ?? config.resolvedProvider,
          model: error?.model ?? reviewModel,
          status: providerInfo.status,
          temporary: providerInfo.temporary,
        },
        "final review failed"
      );

      return {
        apiVersion: API_VERSION,
        mode: API_MODE,
        importOpId: request.importOpId,
        requestId,
        status: "error",
        commands: [],
        message: `Final review failed: ${providerInfo.message}`,
        latencyMs,
        providerStatusCode: providerInfo.status ?? null,
        model: reviewModel,
        meta: buildFinalReviewMeta({
          coverage: determineCoverageStatus([], request),
        }),
      };
    }
  }

  const latencyMs = Date.now() - startTime;
  return {
    apiVersion: API_VERSION,
    mode: API_MODE,
    importOpId: request.importOpId,
    requestId,
    status: "partial",
    commands: [],
    message: "Final review returned no parseable commands.",
    latencyMs,
    model: reviewModel,
    meta: buildFinalReviewMeta({
      coverage: determineCoverageStatus([], request),
    }),
  };
};

export const getFinalReviewModel = () =>
  resolveFinalReviewRuntime().resolvedModel || DEFAULT_MODEL_ID;

export const getFinalReviewRuntime = () => resolveFinalReviewRuntime();
