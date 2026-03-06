import { jsPDF } from "jspdf";
import {
  type ExportRequest,
  buildFullHtmlDocument,
  sanitizeExportFileBaseName,
} from "./shared";

/**
 * يُصدّر المستند كـ PDF عبر jsPDF + html2canvas.
 *
 * الإصلاح: النسخة القديمة كانت تحقن HTML خام بدون أي CSS.
 * الآن: يبني HTML كامل عبر buildFullHtmlDocument (نفس تنسيقات المحرر)
 * ثم يحوّله لـ PDF.
 */
export const exportAsPdf = async (request: ExportRequest): Promise<void> => {
  const fileBase = sanitizeExportFileBaseName(request.fileNameBase);

  // بناء HTML كامل بالتنسيقات — مثل ما المستخدم شايفه في المحرر
  const styledHtml = buildFullHtmlDocument(request.html, request.title);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "794px";
  container.style.background = "#fff";
  container.innerHTML = styledHtml;
  document.body.appendChild(container);

  // jsPDF بيحتاج يشوف الـ body الداخلي مش الـ html wrapper
  const innerBody = container.querySelector("body") ?? container;

  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });
    pdf.setR2L(true);

    await pdf.html(innerBody, {
      x: 24,
      y: 24,
      margin: [24, 24, 24, 24],
      autoPaging: "text",
      width: 547,
      windowWidth: 794,
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        logging: false,
      },
    });

    pdf.save(`${fileBase}.pdf`);
  } finally {
    container.remove();
  }
};
