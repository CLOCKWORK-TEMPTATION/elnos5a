/**
 * @module server/ai-context-gemini
 * @description
 * Backend route لطبقة السياق المُعزَّزة بـ Gemini Flash.
 *
 * يستقبل النص الكامل + التصنيفات المحلية من الفرونت إند،
 * يرسلها لـ Gemini Flash عبر streaming،
 * ويرجع تصحيحات كـ Server-Sent Events (SSE).
 *
 * Route: POST /api/ai/context-enhance → SSE stream
 */

import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import pino from "pino";

config();

const logger = pino({ name: "ai-context-gemini" });

// ─── الثوابت ──────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const MAX_LINES_PER_REQUEST = 500;
const _REQUEST_TIMEOUT_MS = 60_000;

// ─── تحليل الإعدادات من البيئة ────────────────────────────────────

const resolveGeminiConfig = (env = process.env) => {
  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  const model = (env.AI_CONTEXT_MODEL ?? DEFAULT_MODEL).trim();
  const enabled =
    (env.AI_CONTEXT_ENABLED ?? "true").trim().toLowerCase() !== "false";

  return { apiKey, model, enabled };
};

// ─── System Prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `

<ROLE>
أنت وكيل متخصص حصريًا في بناء السياق البنيوي لعناصر السيناريو العربي.

وظيفتك الأساسية ليست مجرد إعادة التصنيف، بل **إعادة بناء السياق الهيكلي للنص الدرامي** ثم استخدام هذا السياق لاتخاذ القرار الصحيح حول نوع السطر المشتبه فيه.

النظام الذي يرسل لك المدخلات قام مسبقًا بتصنيف النص، لكنه قد يكون أخطأ في بعض الأسطر.
مهمتك هي فحص **السطر المشتبه فيه داخل سياقه الحقيقي** وتحديد ما إذا كان:
- التصنيف الحالي صحيح
- أو يجب تصحيحه

السياق هو مصدر الحقيقة الأساسي.
لا تعتمد على السطر وحده بل على علاقته بما قبله وما بعده.

يُرسل إليك النظام:
- السطر المشتبه فيه
- نوعه الحالي
- سطور السياق قبله وبعده

مهمتك الوحيدة:
إرجاع قرار نهائي حول النوع الصحيح.

لا تشرح.
لا تفسر.
لا تضف أي نص خارج JSON.
</ROLE>


<ALLOWED_TYPES>

الأنواع المسموح بها فقط:

action  
dialogue  
character  
cene_header_1  
cene_header_2  
scene_header_3  
transition  
parenthetical  
basmala

لا تستخدم أي نوع خارج هذه القائمة.
</ALLOWED_TYPES>


<CORE_PRINCIPLE_CONTEXT_BUILDING>

قبل اتخاذ أي قرار يجب أن تبني نموذجًا داخليًا للسياق الدرامي للنص.

السياق في السيناريو العربي يعتمد على **تدفق العناصر البنيوية** وليس على الجملة المفردة.

بناء السياق يتم عبر تحليل العلاقات التالية:

1) علاقة السطر بما قبله  
2) علاقة السطر بما بعده  
3) نمط الكتلة الدرامية (Scene Block)  
4) نمط كتلة الحوار (Dialogue Block)  
5) نمط الوصف (Action Flow)

لا يجوز اتخاذ قرار من السطر وحده.

السطر قد يكون:
- جزءًا من حوار مستمر
- بداية حوار
- وصفًا
- رأس مشهد
- انتقالًا
</CORE_PRINCIPLE_CONTEXT_BUILDING>


<STRUCTURAL_CONTEXT_RULES>

القواعد البنيوية الأساسية التي تحكم السياق:

SCENE FLOW

scene-header → action → character → dialogue → action → transition → scene-header


CHARACTER BLOCK

character
→ dialogue
→ dialogue continuation
→ action


DIALOGUE FLOW

بعد character يجب أن يأتي:
dialogue
أو
parenthetical

dialogue قد يستمر لعدة أسطر.


ACTION FLOW

الوصف السردي للأحداث أو الحركة أو الحالة النفسية.
غالبًا يأتي:
بعد scene-header
أو بعد dialogue.


TRANSITION

يظهر غالبًا:
بعد نهاية المشهد
وقبل رأس المشهد التالي.


BASMALA

تظهر فقط في بداية النص.
</STRUCTURAL_CONTEXT_RULES>


<CRITICAL_CONTEXT_RULES>

هذه القواعد ذات أولوية قصوى عند اتخاذ القرار:


RULE 1

إذا جاء سطر بعد CHARACTER مباشرة  
فالأرجح أنه DIALOGUE أو PARENTHETICAL وليس ACTION.


RULE 2

إذا جاء سطر بعد DIALOGUE  
وكان جملة كلامية طبيعية  
فهو استمرار DIALOGUE حتى لو لم يسبق باسم شخصية.


RULE 3

وجود اسم داخل الجملة لا يجعل السطر CHARACTER.


RULE 4

الأسماء داخل الوصف تبقى ACTION.


RULE 5

وجود ":" في نهاية الاسم مؤشر قوي على CHARACTER.


RULE 6

رأس المشهد يظهر غالبًا في بداية كتلة جديدة وليس وسط الحوار.


RULE 7

الانتقال TRANSITION غالبًا سطر منفصل قصير.
</CRITICAL_CONTEXT_RULES>


<SCENE_HEADER_DETECTION>

رؤوس المشاهد قد تكون ثلاثة أنواع:

cene_header_1  
مثال  
مشهد 12

cene_header_2  
مثال  
نهار - داخلي

scene_header_3  
وصف المكان  
مثل  
منزل حسن

</SCENE_HEADER_DETECTION>


<DIALOGUE_CONTEXT>

كتلة الحوار تتكون من:

character  
dialogue  
parenthetical (اختياري)  
dialogue continuation


إذا كان السطر داخل كتلة الحوار
فالأرجح أنه DIALOGUE حتى لو كان طويلاً.
</DIALOGUE_CONTEXT>


<ACTION_CONTEXT>

أي سطر يصف:

حركة  
وصف  
حدث  
حالة نفسية  
معلومة سردية  

ولا ينتمي لكتلة الحوار

يصنف ACTION.
</ACTION_CONTEXT>


<INPUT_MODEL>

يتم إرسال الأسطر المشتبه فيها بالشكل التالي:

itemIndex  
assignedType  
text  
contextLines

contextLines تحتوي سطور قبل وبعد السطر المشتبه فيه.

يجب استخدام هذه السطور لبناء السياق.
</INPUT_MODEL>


<DECISION_POLICY>

لكل سطر مشتبه فيه:

1) اقرأ النص
2) حلل السياق السابق
3) حلل السياق اللاحق
4) حدد الكتلة البنيوية التي ينتمي إليها
5) قرر النوع الصحيح


إذا كان التصنيف الحالي صحيحًا  
أعد نفس النوع.

إذا كان خاطئًا  
أعد النوع الصحيح.
</DECISION_POLICY>


<CONFIDENCE_POLICY>

confidence رقم بين 0 و 1.

0.95 — سياق واضح جدًا  
0.85 — سياق قوي  
0.75 — سياق مقبول  
0.70 — الحد الأدنى للتصحيح


لا تقم بتغيير النوع إذا كانت الثقة أقل من 0.7.
</CONFIDENCE_POLICY>


<OUTPUT_FORMAT>

الإخراج يجب أن يكون JSON فقط.

الشكل الإلزامي:

{
  "decisions": [
    {
      "itemIndex": 12,
      "finalType": "action",
      "confidence": 0.96,
      "reason": "context indicates narrative description"
    }
  ]
}

القواعد:

itemIndex يجب أن يطابق المدخل  
confidence بين 0 و 1  
لا تضف أي مفاتيح أخرى  
لا تضف نص خارج JSON
</OUTPUT_FORMAT>


<ABSOLUTE_CONSTRAINTS>

لا تشرح.
لا تلخص.
لا تضف تعليق.
لا تكتب نص خارج JSON.

الاستجابة يجب أن تكون JSON صالح فقط.

`;
// ─── بناء prompt المستخدم ─────────────────────────────────────────

const buildUserPrompt = (classifiedLines) => {
  const formatted = classifiedLines
    .map(
      (line, index) =>
        `[${index}] (${line.assignedType}, ثقة=${line.confidence}%) ${line.text}`
    )
    .join("\n");

  return `## النص المُصنّف:\n${formatted}\n\n## حلل السياق وأرجع التصحيحات:`;
};

// ─── تحليل استجابة Gemini (streaming) ─────────────────────────────

/**
 * Regex لاستخراج JSON objects من النص المتدفق.
 * بيدور على أي JSON object كامل { ... } يحتوي itemIndex أو lineIndex.
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
 * يحلل chunk نصي ويستخرج منه تصحيحات JSON صالحة.
 * يدعم الفورمات:
 *   - جديد: { itemIndex, finalType, confidence, reason }
 *   - قديم: { lineIndex, correctedType, confidence, reason }
 */
const parseCorrectionsFromChunk = (text) => {
  const corrections = [];
  const matches = text.match(JSON_DECISION_RE);
  if (!matches) return corrections;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);

      // استخراج lineIndex: جديد (itemIndex) أو قديم (lineIndex)
      const lineIndex = parsed.itemIndex ?? parsed.lineIndex;
      if (typeof lineIndex !== "number") continue;

      // استخراج correctedType: جديد (finalType) أو قديم (correctedType)
      const rawType = parsed.finalType ?? parsed.correctedType;
      if (typeof rawType !== "string") continue;

      const correctedType = kebabToSnake(rawType);
      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.85;

      corrections.push({
        lineIndex,
        correctedType,
        confidence,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        source: "gemini-context",
      });
    } catch {
      // JSON غير صالح — نتجاهل
    }
  }

  return corrections;
};

// ─── Validation ───────────────────────────────────────────────────

const validateRequestBody = (body) => {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body." };
  }

  const { classifiedLines, sessionId } = body;

  if (!Array.isArray(classifiedLines) || classifiedLines.length === 0) {
    return {
      valid: false,
      error: "classifiedLines is required and must be a non-empty array.",
    };
  }

  if (classifiedLines.length > MAX_LINES_PER_REQUEST) {
    return {
      valid: false,
      error: `Too many lines: ${classifiedLines.length} (max ${MAX_LINES_PER_REQUEST}).`,
    };
  }

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { valid: false, error: "sessionId is required." };
  }

  return { valid: true, error: null };
};

// ─── Handler ──────────────────────────────────────────────────────

/**
 * POST /api/ai/context-enhance
 *
 * Body:
 * {
 *   sessionId: string,
 *   classifiedLines: Array<{ text: string, assignedType: string, confidence: number }>
 * }
 *
 * Response: SSE stream
 * - event: correction → { lineIndex, correctedType, confidence, reason, source }
 * - event: done → { totalCorrections }
 * - event: error → { message }
 */
export const handleContextEnhance = async (req, res) => {
  const geminiConfig = resolveGeminiConfig();

  if (!geminiConfig.enabled) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(
      `event: done\ndata: ${JSON.stringify({ totalCorrections: 0, reason: "disabled" })}\n\n`
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

  const { classifiedLines, sessionId } = body;
  const startedAt = Date.now();
  let totalCorrections = 0;

  try {
    const ai = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
    const userPrompt = buildUserPrompt(classifiedLines);

    logger.info(
      {
        sessionId,
        model: geminiConfig.model,
        lineCount: classifiedLines.length,
      },
      "gemini-context-enhance-start"
    );

    // Streaming call
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
    const sentCorrections = new Set();

    for await (const chunk of response) {
      if (res.destroyed) break;

      const chunkText = chunk.text ?? "";
      accumulatedText += chunkText;

      // استخراج تصحيحات من النص المتراكم
      const corrections = parseCorrectionsFromChunk(accumulatedText);

      for (const correction of corrections) {
        // تجنب إرسال نفس التصحيح مرتين
        const key = `${correction.lineIndex}:${correction.correctedType}`;
        if (sentCorrections.has(key)) continue;
        sentCorrections.add(key);

        totalCorrections += 1;
        res.write(`event: correction\ndata: ${JSON.stringify(correction)}\n\n`);
      }
    }

    const latencyMs = Date.now() - startedAt;
    logger.info(
      {
        sessionId,
        totalCorrections,
        latencyMs,
      },
      "gemini-context-enhance-complete"
    );

    res.write(
      `event: done\ndata: ${JSON.stringify({ totalCorrections, latencyMs })}\n\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ sessionId, error: message }, "gemini-context-enhance-error");

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

export const getGeminiContextHealth = () => {
  const geminiConfig = resolveGeminiConfig();
  return {
    configured: Boolean(geminiConfig.apiKey),
    enabled: geminiConfig.enabled,
    model: geminiConfig.model,
  };
};
