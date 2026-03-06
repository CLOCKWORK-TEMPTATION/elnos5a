/**
 * @description أدوات HTTP مساعدة للخادم الخلفي
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequestValidationError";
    this.statusCode = 400;
  }
}

export const isHttpTypedError = (error) =>
  typeof error?.statusCode === "number" &&
  Number.isFinite(error.statusCode) &&
  error.statusCode >= 400 &&
  error.statusCode <= 599;

export const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders,
  });
  res.end(JSON.stringify(payload));
};

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const extractErrorCode = (error, message) => {
  if (typeof error?.errorCode === "string" && error.errorCode.trim()) {
    return error.errorCode.trim();
  }

  const match = String(message ?? "").match(/\[([A-Z0-9_]+)\]/u);
  return match?.[1] || undefined;
};

const MAX_BODY_SIZE = 40 * 1024 * 1024;

export const readRawBody = async (req) =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(new Error("Request body exceeded max allowed size."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });

export const readJsonBody = async (req) => {
  const raw = await readRawBody(req);
  const text = raw.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
};
