/**
 * @description متحكم المراجعة النهائية (Final Review)
 */

import { randomUUID } from "crypto";
import {
  FinalReviewValidationError,
  requestFinalReview,
} from "../final-review.mjs";
import { sendJson, readJsonBody } from "../utils/http-helpers.mjs";

export const handleFinalReview = async (req, res) => {
  let importOpId = null;
  try {
    const rawBody = await readJsonBody(req);
    importOpId =
      typeof rawBody?.importOpId === "string" ? rawBody.importOpId : null;
    const response = await requestFinalReview(rawBody);
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
      error instanceof FinalReviewValidationError ? error.statusCode : 500;
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
