/**
 * @description متحكم استخراج وتصنيف النصوص الملصوقة عبر المحرك المضمّن
 */

import { sendJson, readRawBody } from "../utils/http-helpers.mjs";
import { normalizeIncomingText } from "../services/text-normalizer.mjs";
import { normalizeExtractionResponseData } from "../services/response-normalizer.mjs";
import * as karankBridge from "../karank-bridge.mjs";

const MAX_TEXT_LENGTH = 200_000;

export const handleTextExtract = async (req, res) => {
  try {
    const rawBody = await readRawBody(req);
    const bodyText = rawBody.toString("utf8");

    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      sendJson(res, 400, { success: false, error: "Invalid JSON body." });
      return;
    }

    if (!parsedBody || typeof parsedBody.text !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "الحقل text مطلوب ويجب أن يكون نصاً.",
      });
      return;
    }

    const text = normalizeIncomingText(parsedBody.text, MAX_TEXT_LENGTH);
    if (!text.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "النص فارغ بعد التطبيع.",
      });
      return;
    }

    const engineResult = await karankBridge.parseText(text);
    const schemaText =
      engineResult.schemaText || engineResult.schema_text || "";
    const schemaElements =
      engineResult.schemaElements || engineResult.schema_elements || [];

    const rawResult = {
      text: schemaText,
      method: "karank-engine-bridge",
      usedOcr: false,
      attempts: ["karank-engine-bridge"],
      warnings: [],
      schemaText,
      schemaElements,
      rawExtractedText: text,
    };

    const normalizedData = normalizeExtractionResponseData(rawResult, "txt");

    sendJson(res, 200, {
      success: true,
      data: normalizedData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    console.error("[text-extract] Error:", message);
    sendJson(res, 500, {
      success: false,
      error: "Engine bridge failed",
      message: `تعذر الاتصال بمحرك التحليل. ${message}`,
    });
  }
};
