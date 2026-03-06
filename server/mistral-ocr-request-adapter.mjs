import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PATCH_MARKER = Symbol.for("filmlane.mistral.ocr.request.adapter");

const normalizeDocument = (document) => {
  if (!document || typeof document !== "object") {
    return document;
  }

  const normalized = { ...document };

  if (
    normalized.type === "document_url" &&
    typeof normalized.document_url === "string" &&
    typeof normalized.documentUrl !== "string"
  ) {
    normalized.documentUrl = normalized.document_url;
  }

  if (
    normalized.type === "image_url" &&
    typeof normalized.image_url === "object" &&
    normalized.image_url !== null &&
    typeof normalized.imageUrl === "undefined"
  ) {
    normalized.imageUrl = normalized.image_url;
  }

  return normalized;
};

const normalizeOcrRequest = (request) => {
  if (!request || typeof request !== "object") {
    return request;
  }

  return {
    ...request,
    document: normalizeDocument(request.document),
  };
};

const installOcrRequestAdapter = () => {
  const { Ocr } = require("@mistralai/mistralai/sdk/ocr.js");

  if (!Ocr?.prototype?.process) {
    return;
  }

  const originalProcess = Ocr.prototype.process;

  if (originalProcess[PATCH_MARKER]) {
    return;
  }

  const patchedProcess = function patchedOcrProcess(request, options) {
    return originalProcess.call(this, normalizeOcrRequest(request), options);
  };

  Object.defineProperty(patchedProcess, PATCH_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  Ocr.prototype.process = patchedProcess;
};

installOcrRequestAdapter();
