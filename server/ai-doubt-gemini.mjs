/**
 * @module server/ai-doubt-gemini
 * @description
 * Backend route لطبقة كشف الشبهة المُعزَّزة بـ Gemini 3.1 Flash-Lite.
 *
 * يستقبل السطور المشبوهة + سياقها من الفرونت إند،
 * يرسلها لـ Gemini 3.1 Flash-Lite عبر streaming API،
 * ويرجع أحكام كـ Server-Sent Events (SSE).
 *
 * Route: POST /api/ai/doubt-resolve → SSE stream
 */

import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import pino from "pino";

config();

const logger = pino({ name: "ai-doubt-gemini" });

// ─── الثوابت ──────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const MAX_SUSPICIOUS_LINES = 100;

// ─── تحليل الإعدادات من البيئة ────────────────────────────────────

const resolveGeminiDoubtConfig = (env = process.env) => {
  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  const model = (env.AI_DOUBT_MODEL ?? DEFAULT_MODEL).trim();
  const enabled =
    (env.AI_DOUBT_ENABLED ?? "true").trim().toLowerCase() !== "false";

  return { apiKey, model, enabled };
};

// ─── System Prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `
<role>
أنت وكيل متخصص حصريًا في المراجعة النهائية وإعادة تصنيف عناصر السيناريو العربي.
تعمل على سطور تم تعليمها مسبقًا كمشبوهة بواسطة نظام كشف الشكوك.

مهمتك الوحيدة:
- قراءة السطر المشبوه مع السياق المحيط به.
- تحديد النوع الصحيح للعنصر الدرامي.
- إما تأكيد التصنيف الحالي أو تصحيحه.
- إخراج القرار بصيغة JSON فقط دون أي نص إضافي.
</role>

<allowed_types>
القائمة المسموحة للنوع النهائي:

action
dialogue
character
cene_header_1
cene_header_2
scene_header_3
transition
parenthetical
basmala
</allowed_types>

<task_definition>
لكل عنصر مُرسل إليك:

1) اقرأ:
- text
- assignedType
- contextLines

2) قرر أحد خيارين:

أ) التصنيف صحيح
→ احتفظ بنفس النوع

ب) التصنيف خاطئ
→ اختر النوع الصحيح من القائمة المسموحة فقط

لا يسمح باختراع أنواع جديدة.
</task_definition>

<classification_rules>

<basmala>
السطر الذي يبدأ بـ:
بسم الله الرحمن الرحيم
يُصنف:
basmala
</basmala>

<scene_headers>

cene_header_1:
نمط:
مشهد + رقم

cene_header_2:
نمط يحتوي زمن + داخلي/خارجي
مثل:
ليل داخلي
نهار خارجي

scene_header_3:
وصف مكان تفصيلي يأتي بعد رأس المشهد
مثل:
منزل محمود
مكتب المدير

</scene_headers>

<character>
اسم شخصية يتحدث.
عادة:

- سطر قصير
- بدون أفعال
- غالبًا ينتهي بنقطتين :

مثال:
نور :
مدحت :
صوت عمرو دياب :
</character>

<dialogue>
أي نص يأتي مباشرة بعد CHARACTER
ويستمر حتى ظهور:

- CHARACTER جديد
- ACTION واضح
- TRANSITION
- SCENE HEADER
</dialogue>

<parenthetical>
توجيه أدائي داخل الحوار
غالبًا بين أقواس.

مثال:
(بغضب)
(يهمس)
</parenthetical>

<action>
أي وصف للمشهد أو الأحداث.

يتضمن:
- الأفعال السردية
- وصف الحركة
- وصف المكان
- وصف الحالة

أمثلة:
يدخل محمود الغرفة.
تجلس نهال على الكرسي.

مهم:
وجود أسماء داخل الوصف لا يحوله إلى CHARACTER.
</action>

<transition>
سطر انتقال بين المشاهد.

أمثلة:
قطع
قطع إلى
مزج
إظلام
</transition>

</classification_rules>

<decision_rules>

لكل عنصر:

إذا كان assignedType صحيحًا
→ احتفظ به.

إذا كان خاطئًا
→ اختر النوع الصحيح.

لا تضف أنواع خارج القائمة المسموحة.

confidence:
رقم بين 0 و 1 يعبر عن درجة الثقة.

reason:
سبب قصير جدًا يوضح القرار.
</decision_rules>

<output_contract>

الإخراج يجب أن يكون JSON فقط.

الصيغة الإلزامية:

{
  "decisions": [
    {
      "itemIndex": 12,
      "finalType": "action",
      "confidence": 0.96,
      "reason": "وصف حدث سردي"
    }
  ]
}

قواعد صارمة:

- itemIndex يجب أن يطابق المدخل.
- finalType يجب أن يكون من القائمة المسموحة فقط.
- confidence رقم بين 0 و 1.
- reason نص قصير جدًا.
- لا تضف أي مفاتيح أخرى.
- لا تكتب أي نص خارج JSON.
</output_contract>

<constraints>

لا تشرح.
لا تلخص.
لا تعيد صياغة النص.
لا تضف تعليقات.
لا تخرج أي نص خارج JSON.

إذا كان التصنيف صحيحًا:
finalType = assignedType.

قيّم جميع العناصر المرسلة دون توقف.
</constraints>
`;

// ─── بناء prompt المستخدم ─────────────────────────────────────────

const buildUserPrompt = (suspiciousLines) => {
  const formatted = suspiciousLines
    .map((line) => {
      const contextStr = (line.contextLines ?? [])
        .map(
          (ctx) => `    [${ctx.lineIndex}] (${ctx.assignedType}) ${ctx.text}`
        )
        .join("\n");

      const reasonsStr =
        line.reasons && line.reasons.length > 0
          ? `  أسباب الشبهة: ${line.reasons.join(" | ")}`
          : "";

      return [
        `─── سطر مشبوه [${line.lineIndex}] ───`,
        `  النص: ${line.text}`,
        `  التصنيف الحالي: ${line.assignedType}`,
        `  درجة الشبهة: ${line.totalSuspicion}`,
        reasonsStr,
        contextStr ? `  السياق المحيط:\n${contextStr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `## السطور المشبوهة:\n\n${formatted}\n\n## احكم على كل سطر:`;
};

// ─── تحليل استجابة Gemini (streaming) ──────────────────────────────

/**
 * Regex لاستخراج JSON objects من النص المتدفق.
 * بيدور على أي JSON object يحتوي itemIndex أو lineIndex.
 */
const JSON_DECISION_RE =
  /\{[^{}]*"(?:itemIndex|lineIndex)"\s*:\s*\d+[^{}]*\}/gu;

/**
 * تحويل kebab-case لـ snake_case (scene_header_3 → scene_header_3)
 * scene_header_top_line مش نوع تصنيف — لو الـ AI رجّعه نحوّله لـ scene_header_1
 */
const kebabToSnake = (type) => {
  const snake = type.replace(/-/g, "_");
  return snake === "scene_header_top_line" ? "scene_header_1" : snake;
};

/**
 * يحلل chunk نصي ويستخرج منه أحكام JSON صالحة.
 * يدعم الفورمات:
 *   - جديد: { itemIndex, finalType, confidence, reason }
 *   - قديم: { lineIndex, verdict, newType, confidence, reason }
 *
 * @param {string} text - النص المتراكم من Gemini
 * @param {Map<number, string>} originalTypes - خريطة lineIndex → assignedType الأصلي
 */
const parseVerdictsFromChunk = (text, originalTypes) => {
  const verdicts = [];
  const matches = text.match(JSON_DECISION_RE);
  if (!matches) return verdicts;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);

      // ── الفورمات الجديد: { itemIndex, finalType, confidence, reason } ──
      const lineIndex = parsed.itemIndex ?? parsed.lineIndex;
      if (typeof lineIndex !== "number") continue;

      const rawType = parsed.finalType ?? parsed.newType;

      if (typeof rawType === "string") {
        const correctedType = kebabToSnake(rawType);
        const originalType = originalTypes.get(lineIndex);
        const isConfirm =
          originalType && kebabToSnake(originalType) === correctedType;

        const confidence =
          typeof parsed.confidence === "number"
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.8;

        const verdict = {
          lineIndex,
          verdict: isConfirm ? "confirm" : "relabel",
          confidence,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
          source: "gemini-doubt",
        };

        if (!isConfirm) {
          verdict.newType = correctedType;
          verdict.correctedType = correctedType;
        }

        verdicts.push(verdict);
        continue;
      }

      // ── الفورمات القديم: { lineIndex, verdict, newType } ──
      if (
        typeof parsed.verdict === "string" &&
        (parsed.verdict === "confirm" || parsed.verdict === "relabel")
      ) {
        const verdict = {
          lineIndex,
          verdict: parsed.verdict,
          confidence:
            typeof parsed.confidence === "number"
              ? Math.max(0, Math.min(1, parsed.confidence))
              : 0.8,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
          source: "gemini-doubt",
        };

        if (
          parsed.verdict === "relabel" &&
          typeof parsed.newType === "string"
        ) {
          verdict.newType = kebabToSnake(parsed.newType);
          verdict.correctedType = verdict.newType;
        }

        verdicts.push(verdict);
      }
    } catch {
      // JSON غير صالح — نتجاهل
    }
  }

  return verdicts;
};

// ─── Validation ───────────────────────────────────────────────────

const validateRequestBody = (body) => {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body." };
  }

  const { suspiciousLines, sessionId } = body;

  if (!Array.isArray(suspiciousLines) || suspiciousLines.length === 0) {
    return {
      valid: false,
      error: "suspiciousLines is required and must be a non-empty array.",
    };
  }

  if (suspiciousLines.length > MAX_SUSPICIOUS_LINES) {
    return {
      valid: false,
      error: `Too many suspicious lines: ${suspiciousLines.length} (max ${MAX_SUSPICIOUS_LINES}).`,
    };
  }

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { valid: false, error: "sessionId is required." };
  }

  return { valid: true, error: null };
};

// ─── Handler ──────────────────────────────────────────────────────

/**
 * POST /api/ai/doubt-resolve
 *
 * Body:
 * {
 *   sessionId: string,
 *   suspiciousLines: Array<{
 *     lineIndex: number,
 *     text: string,
 *     assignedType: string,
 *     totalSuspicion: number,
 *     reasons: string[],
 *     contextLines: Array<{ lineIndex: number, assignedType: string, text: string }>
 *   }>
 * }
 *
 * Response: SSE stream
 * - event: verdict → { lineIndex, verdict, newType?, correctedType?, confidence, reason, source }
 * - event: done → { totalVerdicts }
 * - event: error → { message }
 */
export const handleDoubtResolve = async (req, res) => {
  const geminiConfig = resolveGeminiDoubtConfig();

  if (!geminiConfig.enabled) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(
      `event: done\ndata: ${JSON.stringify({ totalVerdicts: 0, reason: "disabled" })}\n\n`
    );
    res.end();
    return;
  }

  if (!geminiConfig.apiKey) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: "GEMINI_API_KEY not configured." })}\n\n`
    );
    res.end();
    return;
  }

  let body;
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.writeHead(400, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: "Invalid JSON body." }));
    return;
  }

  const validation = validateRequestBody(body);
  if (!validation.valid) {
    res.writeHead(400, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });

  const { suspiciousLines, sessionId } = body;
  const startedAt = Date.now();
  let totalVerdicts = 0;

  // خريطة lineIndex → assignedType الأصلي لتحديد confirm/relabel
  const originalTypes = new Map(
    suspiciousLines.map((line) => [line.lineIndex, line.assignedType])
  );

  try {
    const ai = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
    const userPrompt = buildUserPrompt(suspiciousLines);

    logger.info(
      {
        sessionId,
        model: geminiConfig.model,
        suspiciousCount: suspiciousLines.length,
      },
      "gemini-doubt-resolve-start"
    );

    // Streaming call — following official Gemini 3 docs pattern
    const response = await ai.models.generateContentStream({
      model: geminiConfig.model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: "low" },
      },
    });

    let accumulatedText = "";
    const sentVerdicts = new Set();

    for await (const chunk of response) {
      if (res.destroyed) break;

      const delta = chunk.text ?? "";
      accumulatedText += delta;

      // استخراج أحكام من النص المتراكم
      const verdicts = parseVerdictsFromChunk(accumulatedText, originalTypes);

      for (const verdict of verdicts) {
        const key = `${verdict.lineIndex}:${verdict.verdict}:${verdict.newType ?? ""}`;
        if (sentVerdicts.has(key)) continue;
        sentVerdicts.add(key);

        totalVerdicts += 1;
        res.write(`event: verdict\ndata: ${JSON.stringify(verdict)}\n\n`);
      }
    }

    const latencyMs = Date.now() - startedAt;
    logger.info(
      {
        sessionId,
        totalVerdicts,
        latencyMs,
      },
      "gemini-doubt-resolve-complete"
    );

    res.write(
      `event: done\ndata: ${JSON.stringify({ totalVerdicts, latencyMs })}\n\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ sessionId, error: message }, "gemini-doubt-resolve-error");

    if (!res.destroyed) {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    }
  } finally {
    if (!res.destroyed) {
      res.end();
    }
  }
};

// ─── Health check helper ──────────────────────────────────────────

export const getGeminiDoubtHealth = () => {
  const geminiConfig = resolveGeminiDoubtConfig();
  return {
    configured: Boolean(geminiConfig.apiKey),
    enabled: geminiConfig.enabled,
    model: geminiConfig.model,
  };
};
