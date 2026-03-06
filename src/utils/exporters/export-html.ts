import {
  type ExportRequest,
  buildFullHtmlDocument,
  downloadBlob,
  sanitizeExportFileBaseName,
} from "./shared";

export const exportAsHtml = (request: ExportRequest): void => {
  const fileBase = sanitizeExportFileBaseName(request.fileNameBase);
  const fullDoc = buildFullHtmlDocument(request.html, request.title);
  const blob = new Blob([fullDoc], { type: "text/html;charset=utf-8" });
  downloadBlob(`${fileBase}.html`, blob);
};
