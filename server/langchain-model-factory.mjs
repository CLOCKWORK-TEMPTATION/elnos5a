import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

/**
 * @param {{ provider: string, model: string, valid: boolean, error?: string, credential: { valid: boolean, apiKey: string, message?: string }, baseUrl?: string }} target
 * @param {{ temperature?: number, maxTokens?: number, timeoutMs?: number }} [options]
 * @returns {import("@langchain/core/language_models/chat_models").BaseChatModel}
 */
export const createReviewModel = (
  target,
  { temperature = 0, maxTokens = undefined, timeoutMs = undefined } = {}
) => {
  if (!target?.valid) {
    throw new Error(target?.error || "Review target is not valid.");
  }

  if (!target?.credential?.valid) {
    throw new Error(
      target?.credential?.message || "Provider credential is not valid."
    );
  }

  if (target.provider === "anthropic") {
    return new ChatAnthropic({
      model: target.model,
      apiKey: target.credential.apiKey,
      anthropicApiUrl: target.baseUrl,
      temperature,
      maxTokens,
      maxRetries: 0,
      timeout: timeoutMs,
    });
  }

  if (target.provider === "openai") {
    return new ChatOpenAI({
      model: target.model,
      apiKey: target.credential.apiKey,
      temperature,
      maxTokens,
      maxRetries: 0,
      timeout: timeoutMs,
      configuration: {
        apiKey: target.credential.apiKey,
        baseURL: target.baseUrl,
        timeout: timeoutMs,
      },
    });
  }

  if (target.provider === "deepseek") {
    return new ChatOpenAI({
      model: target.model,
      apiKey: target.credential.apiKey,
      temperature,
      maxTokens,
      maxRetries: 0,
      timeout: timeoutMs,
      configuration: {
        apiKey: target.credential.apiKey,
        baseURL: target.baseUrl,
        timeout: timeoutMs,
      },
    });
  }

  if (target.provider === "google-genai") {
    return new ChatGoogleGenerativeAI({
      model: target.model,
      apiKey: target.credential.apiKey,
      temperature,
      maxOutputTokens: maxTokens,
      timeout: timeoutMs,
    });
  }

  throw new Error(`Unsupported review provider: ${target.provider}`);
};
