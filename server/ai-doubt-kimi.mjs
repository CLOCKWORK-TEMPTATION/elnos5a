/**
 * @module server/ai-doubt-kimi
 * @description
 * Backend route لطبقة كشف الشبهة المُعزَّزة بـ Kimi 2.5.
 *
 * يستقبل السطور المشبوهة + سياقها من الفرونت إند،
 * يرسلها لـ Kimi 2.5 عبر OpenAI-compatible streaming API،
 * ويرجع أحكام كـ Server-Sent Events (SSE).
 *
 * Route: POST /api/ai/doubt-resolve → SSE stream
 */

import { config } from "dotenv";
import OpenAI from "openai";
import pino from "pino";
import { resolveMoonshotChatRuntime } from "./provider-api-runtime.mjs";

config();

const logger = pino({ name: "ai-doubt-kimi" });

// ─── الثوابت ──────────────────────────────────────────────────────

const DEFAULT_MODEL = "kimi-k2.5";
const MAX_SUSPICIOUS_LINES = 100;
const REQUEST_TIMEOUT_MS = 60_000;
const KIMI_K25_RE = /^kimi-k2\.5(?:$|[-_])/iu;

// ─── تحليل الإعدادات من البيئة ────────────────────────────────────

const resolveKimiConfig = (env = process.env) => {
  const apiKey = (env.MOONSHOT_API_KEY ?? "").trim();
  const model = (env.AI_DOUBT_MODEL ?? DEFAULT_MODEL).trim();
  const enabled =
    (env.AI_DOUBT_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const runtime = resolveMoonshotChatRuntime(env);

  return { apiKey, model, enabled, baseURL: runtime.baseUrl };
};

const isKimiK25Model = (model) =>
  typeof model === "string" && KIMI_K25_RE.test(model.trim());

// ─── System Prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت محقق تصنيف سيناريو عربي. مهمتك حل الحالات المشبوهة والغامضة في تصنيف عناصر السيناريو.

## أنواع عناصر السيناريو:
- action: وصف الحدث والمشهد
- character: اسم الشخصية (عادةً سطر قصير ينتهي بنقطتين)
- dialogue: كلام الشخصية
- parenthetical: توجيه أدائي بين قوسين
- scene_header_1: رقم المشهد (مثال: مشهد 5)
- scene_header_2: زمن/موقع المشهد (مثال: ليل - داخلي)
- scene_header_3: تفصيل الموقع (مثال: شقة محمد - غرفة النوم)
- transition: انتقال بين المشاهد
- basmala: البسملة

## مهمتك:
لكل سطر مشبوه مُقدّم لك:
1. اقرأ النص بعناية مع سياقه المحيط
2. قرر: هل التصنيف الحالي صح (confirm) ولا غلط (relabel)?
3. لو غلط — اقترح النوع الصحيح

## قواعد الحكم:
- اسم الشخصية: سطر قصير (1-4 كلمات)، بدون أفعال، ممكن ينتهي بنقطتين
- الحوار: نص طويل نسبياً، بييجي بعد character
- الوصف (action): جمل فعلية تصف أحداث أو مشاهد
- رأس المشهد: يحتوي مكان + زمان (داخلي/خارجي + ليل/نهار)
- الانتقال: كلمات قطع (قطع إلى، مزج)
- التوجيه الأدائي: بين قوسين ()

## المطلوب:
ارجع حكمك لكل سطر مشبوه بصيغة JSON Lines.
ابدأ بـ [VERDICTS_START] وانهي بـ [VERDICTS_END]

## شكل الحكم:
{"lineIndex": N, "verdict": "confirm|relabel", "newType": "type_if_relabel", "confidence": 0.0-1.0, "reason": "سبب مختصر"}

## مهم:
- لو التصنيف صح → verdict = "confirm" (بدون newType)
- لو غلط → verdict = "relabel" مع newType
- الثقة لازم تكون > 0.7
- ركّز على السياق المحيط (السطور قبل وبعد)`;

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

// ─── تحليل استجابة Kimi (streaming) ──────────────────────────────

/**
 * Regex لاستخراج JSON objects من النص المتدفق.
 */
const JSON_LINE_RE = /\{[^{}]*"lineIndex"\s*:\s*\d+[^{}]*\}/gu;

/**
 * يحلل chunk نصي ويستخرج منه أحكام JSON صالحة.
 */
const parseVerdictsFromChunk = (text) => {
  const verdicts = [];
  const matches = text.match(JSON_LINE_RE);
  if (!matches) return verdicts;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);
      if (
        typeof parsed.lineIndex === "number" &&
        typeof parsed.verdict === "string" &&
        (parsed.verdict === "confirm" || parsed.verdict === "relabel")
      ) {
        const verdict = {
          lineIndex: parsed.lineIndex,
          verdict: parsed.verdict,
          confidence:
            typeof parsed.confidence === "number"
              ? Math.max(0, Math.min(1, parsed.confidence))
              : 0.8,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
          source: "kimi-doubt",
        };

        // لو relabel → لازم يكون فيه newType
        if (
          parsed.verdict === "relabel" &&
          typeof parsed.newType === "string"
        ) {
          verdict.newType = parsed.newType;
          verdict.correctedType = parsed.newType;
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
  const kimiConfig = resolveKimiConfig();

  if (!kimiConfig.enabled) {
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

  if (!kimiConfig.apiKey) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: "MOONSHOT_API_KEY not configured." })}\n\n`
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

  try {
    const client = new OpenAI({
      apiKey: kimiConfig.apiKey,
      baseURL: kimiConfig.baseURL,
      timeout: REQUEST_TIMEOUT_MS,
    });

    const userPrompt = buildUserPrompt(suspiciousLines);

    logger.info(
      {
        sessionId,
        model: kimiConfig.model,
        suspiciousCount: suspiciousLines.length,
      },
      "kimi-doubt-resolve-start"
    );
    const model = kimiConfig.model || "kimi-k2.5";
    const isK25 = isKimiK25Model(model);

    const chatPayload = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      temperature: 1,
      max_tokens: 32_768,
      top_p: 0.95,
    };

    if (isK25) {
      chatPayload.extra_body = {
        thinking: { type: kimiConfig.thinkingType ?? "disabled" },
      };
    }

    const stream = await client.chat.completions.create(chatPayload);

    let accumulatedText = "";
    const sentVerdicts = new Set();

    for await (const chunk of stream) {
      if (res.destroyed) break;

      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      accumulatedText += delta;

      // استخراج أحكام من النص المتراكم
      const verdicts = parseVerdictsFromChunk(accumulatedText);

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
      "kimi-doubt-resolve-complete"
    );

    res.write(
      `event: done\ndata: ${JSON.stringify({ totalVerdicts, latencyMs })}\n\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ sessionId, error: message }, "kimi-doubt-resolve-error");

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

export const getKimiDoubtHealth = () => {
  const kimiConfig = resolveKimiConfig();
  return {
    configured: Boolean(kimiConfig.apiKey),
    enabled: kimiConfig.enabled,
    model: kimiConfig.model,
    baseURL: kimiConfig.baseURL,
  };
};
