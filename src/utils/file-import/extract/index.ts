import {
  getFileType,
  type FileExtractionResult,
  type ImportedFileType,
} from "../../../types/file-import";
import {
  extractFileWithBackend,
  isBackendExtractionConfigured,
  type BackendExtractOptions,
} from "./backend-extract";

export * from "./backend-extract";
export * from "./browser-extract";

export interface ExtractImportedFileOptions {
  backend?: BackendExtractOptions;
}

const resolveImportedFileType = (file: File): ImportedFileType => {
  const detectedType = getFileType(file.name);
  if (!detectedType) {
    throw new Error("نوع الملف غير مدعوم في مسار الاستيراد.");
  }
  return detectedType;
};

const assertBackendConfiguration = (endpoint?: string): void => {
  if (!isBackendExtractionConfigured(endpoint)) {
    throw new Error(
      "Backend extraction endpoint غير مضبوط. اضبط VITE_FILE_IMPORT_BACKEND_URL."
    );
  }
};

/**
 * استخراج الملف عبر الباكند فقط (Backend-only strict).
 * لا يوجد أي fallback محلي سواءً للـ PDF أو باقي الصيغ.
 */
export const extractImportedFile = async (
  file: File,
  options?: ExtractImportedFileOptions
): Promise<FileExtractionResult> => {
  const fileType = resolveImportedFileType(file);
  const backendEndpoint = options?.backend?.endpoint;
  assertBackendConfiguration(backendEndpoint);

  return extractFileWithBackend(file, fileType, options?.backend);
};
