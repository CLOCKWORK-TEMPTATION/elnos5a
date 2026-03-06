/**
 * @description تعريف مسارات API للخادم الخلفي
 */

import rateLimit from "express-rate-limit";
import process from "node:process";
import { sendJson } from "../utils/http-helpers.mjs";
import {
  handleExtract,
  ANTIWORD_PREFLIGHT,
} from "../controllers/extract-controller.mjs";
import { handleTextExtract } from "../controllers/text-extract-controller.mjs";
import { handleAgentReview } from "../controllers/agent-review-controller.mjs";
import { handleExportPdfA } from "../controllers/export-controller.mjs";
import {
  handleContextEnhance,
  getGeminiContextHealth,
} from "../ai-context-gemini.mjs";
import {
  handleDoubtResolve,
  getGeminiDoubtHealth,
} from "../ai-doubt-gemini.mjs";
import { getPdfOcrAgentHealth } from "../pdf-ocr-agent-config.mjs";
import {
  getAnthropicReviewModel,
  getAnthropicReviewRuntime,
} from "../agent-review.mjs";
import {
  DEFAULT_ANTIWORD_PATH,
  DEFAULT_ANTIWORD_HOME,
} from "../services/doc-extractor.mjs";
import {
  DOCX_TO_DOC_SCRIPT_PATH,
  DOCX_TO_DOC_SCRIPT_EXISTS,
} from "../services/docx-extractor.mjs";

export const FILE_IMPORT_PREFLIGHT_WARNINGS = [...ANTIWORD_PREFLIGHT.warnings];
if (!DOCX_TO_DOC_SCRIPT_EXISTS) {
  FILE_IMPORT_PREFLIGHT_WARNINGS.push(
    `DOCX converter script غير موجود: ${DOCX_TO_DOC_SCRIPT_PATH}`
  );
}

const extractLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendJson(res, options.statusCode, {
      success: false,
      error: options.message,
    });
  },
});

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendJson(res, options.statusCode, {
      success: false,
      error: options.message,
    });
  },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendJson(res, options.statusCode, {
      success: false,
      error: options.message,
    });
  },
});

export const registerRoutes = (app) => {
  app.get("/health", async (req, res) => {
    const ocrAgent = await getPdfOcrAgentHealth();
    const reviewRuntime = getAnthropicReviewRuntime();
    res.status(200).json({
      status: "ok",
      ok: true,
      service: "file-import-backend",
      antiwordPath: process.env.ANTIWORD_PATH || DEFAULT_ANTIWORD_PATH,
      antiwordHome: process.env.ANTIWORDHOME || DEFAULT_ANTIWORD_HOME,
      antiwordBinaryAvailable: ANTIWORD_PREFLIGHT.binaryAvailable,
      antiwordHomeExists: ANTIWORD_PREFLIGHT.antiwordHomeExists,
      antiwordWarnings: FILE_IMPORT_PREFLIGHT_WARNINGS,
      docxConverterScriptPath: DOCX_TO_DOC_SCRIPT_PATH,
      docxConverterScriptExists: DOCX_TO_DOC_SCRIPT_EXISTS,
      agentReviewConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      aiContextLayer: getGeminiContextHealth(),
      aiDoubtLayer: getGeminiDoubtHealth(),
      ocrConfigured: ocrAgent.configured,
      ocrAgent,
      reviewModel: getAnthropicReviewModel(),
      reviewProvider: reviewRuntime.provider,
      reviewModelRequested: reviewRuntime.requestedModel,
      reviewModelResolved: reviewRuntime.resolvedModel,
      reviewModelFallbackApplied: reviewRuntime.fallbackApplied,
      reviewModelFallbackReason: reviewRuntime.fallbackReason,
      reviewApiBaseUrl: reviewRuntime.baseUrl,
      reviewApiVersion: reviewRuntime.apiVersion,
    });
  });

  app.post("/api/file-extract", extractLimiter, handleExtract);
  app.post("/api/files/extract", extractLimiter, handleExtract);
  app.post("/api/text-extract", extractLimiter, handleTextExtract);
  app.post("/api/agent/review", reviewLimiter, handleAgentReview);
  app.post("/api/ai/context-enhance", aiLimiter, handleContextEnhance);
  app.post("/api/ai/doubt-resolve", aiLimiter, handleDoubtResolve);
  app.post("/api/export/pdfa", handleExportPdfA);

  app.use((req, res) => {
    sendJson(res, 404, { success: false, error: "Route not found." });
  });
};
