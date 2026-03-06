/**
 * @description متحكم مراجعة الوكيل الذكي (Agent Review)
 */

import { randomUUID } from "crypto";
import {
  AgentReviewValidationError,
  requestAnthropicReview,
  validateAgentReviewRequestBody,
} from "../agent-review.mjs";
import { sendJson, readJsonBody } from "../utils/http-helpers.mjs";

export const handleAgentReview = async (req, res) => {
  let importOpId = null;
  try {
    const rawBody = await readJsonBody(req);
    // Extract importOpId early for error response
    importOpId =
      typeof rawBody?.importOpId === "string" ? rawBody.importOpId : null;
    const body = validateAgentReviewRequestBody(rawBody);
    const response = await requestAnthropicReview(body);
    // إذا كان الـ provider رجع status code (529/503/429)، مرره للكلاينت
    // عشان يقدر يعمل retry صحيح
    const httpStatus =
      response.status === "error" &&
      typeof response.providerStatusCode === "number" &&
      response.providerStatusCode >= 400
        ? response.providerStatusCode
        : 200;
    sendJson(res, httpStatus, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      error instanceof AgentReviewValidationError ? error.statusCode : 500;
    // v2-compliant error response
    sendJson(res, statusCode, {
      apiVersion: "2.0",
      mode: "auto-apply",
      importOpId: importOpId ?? "unknown",
      requestId: randomUUID(),
      status: "error",
      commands: [],
      message,
      latencyMs: 0,
    });
  }
};
