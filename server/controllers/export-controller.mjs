/**
 * @description متحكم تصدير PDF/A عبر Puppeteer
 */

import { sendJson, readJsonBody, corsHeaders } from "../utils/http-helpers.mjs";

/**
 * يُصدّر HTML إلى PDF عالي الجودة عبر Puppeteer (مرحلة PDF/A).
 * Puppeteer يدعم Arabic/RTL بشكل كامل عبر Chromium.
 */
export const handleExportPdfA = async (req, res) => {
  let browser = null;
  try {
    const body = await readJsonBody(req);
    const html = typeof body?.html === "string" ? body.html : "";
    if (!html.trim()) {
      sendJson(res, 400, { success: false, error: "HTML content is empty." });
      return;
    }

    const puppeteer = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    });

    await browser.close();
    browser = null;

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      ...corsHeaders,
    });
    res.end(Buffer.from(pdfBuffer));
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // تجاهل أخطاء إغلاق المتصفح
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[export/pdfa] Error:", message);
    sendJson(res, 500, { success: false, error: message });
  }
};
