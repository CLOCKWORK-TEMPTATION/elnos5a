import {
  type ExportRequest,
  buildFullHtmlDocument,
  downloadBlob,
  sanitizeExportFileBaseName,
} from "./shared";

const PDFA_ENDPOINT_PATH = "/api/export/pdfa";

/**
 * يكتشف عنوان backend تلقائيًا من متغير البيئة أو يستخدم القيمة الافتراضية.
 */
const getBackendBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as
    | string
    | undefined;
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      return url.origin;
    } catch {
      // تجاهل URL غير صالح
    }
  }
  return "http://127.0.0.1:8787";
};

/**
 * يتحقق من توفر خادم التصدير قبل الإرسال.
 */
const checkServerHealth = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * يُصدّر المستند بصيغة PDF/A عبر خادم Puppeteer الخلفي.
 *
 * المسار:
 * 1. يبني HTML كامل مع التنسيقات
 * 2. يرسله POST إلى /api/export/pdfa
 * 3. الخادم يستخدم Puppeteer لتحويل HTML → PDF
 * 4. يستقبل blob ويحفظه
 */
export const exportAsPdfA = async (request: ExportRequest): Promise<void> => {
  const fileBase = sanitizeExportFileBaseName(request.fileNameBase);
  const fullHtml = buildFullHtmlDocument(request.html, request.title);
  const baseUrl = getBackendBaseUrl();

  const isHealthy = await checkServerHealth(baseUrl);
  if (!isHealthy) {
    throw new Error(
      "خادم التصدير غير متاح. تأكد من تشغيل الخادم الخلفي (pnpm dev)."
    );
  }

  const response = await fetch(`${baseUrl}${PDFA_ENDPOINT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html: fullHtml,
      filename: `${fileBase}.pdf`,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      (errorData as { error?: string })?.error ??
        `فشل تصدير PDF/A (${response.status})`
    );
  }

  const blob = await response.blob();
  downloadBlob(`${fileBase}.pdf`, blob);
};
