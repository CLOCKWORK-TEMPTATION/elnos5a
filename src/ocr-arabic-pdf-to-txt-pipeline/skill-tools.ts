/**
 * skill-tools.ts — تغليف سكريبتات المهارة (skill) كأدوات AI SDK
 *
 * يحوّل السكريبتات الموجودة في skill.zip إلى أدوات قابلة للاستدعاء
 * من الوكيل مباشرةً عبر `tool()` من Vercel AI SDK v6.
 *
 * السكريبتات المُغلَّفة:
 *   - classify-pdf.ts   → أداة skill_classify_pdf
 *   - ocr-mistral.ts    → أداة skill_ocr_mistral
 *   - write-output.ts   → أداة skill_write_output
 *   - enhance-image.ts  → أداة skill_enhance_images
 *
 * كل أداة تُنفِّذ السكريبت الأصلي كعملية فرعية (child process)
 * وتُعيد النتيجة بصيغة JSON.
 */

import { tool } from "ai";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// ─── مسارات السكريبتات ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = resolve(__dirname, "skill-scripts");

/**
 * تنفيذ سكريبت TypeScript عبر npx tsx
 * يلتقط stdout (JSON) و stderr (سجل العمليات)
 */
async function runScript(
  scriptName: string,
  args: string[],
  timeoutMs = 300_000
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);

  // التحقق من وجود السكريبت
  try {
    await stat(scriptPath);
  } catch {
    throw new Error(`السكريبت غير موجود: ${scriptPath}`);
  }

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...args],
    {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB — لملفات OCR الكبيرة
      env: {
        ...process.env,
        // ضمان تمرير مفاتيح API
        MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"] ?? "",
        OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "",
      },
    }
  );

  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

// ═══════════════════════════════════════════════════════════════
// أداة 1: تصنيف PDF (classify-pdf.ts)
// ═══════════════════════════════════════════════════════════════

export const skillClassifyPdf = tool({
  description: `تصنيف ملف PDF وتحديد نوعه (نصي / ممسوح ضوئياً / مختلط / محمي) والمحرك الأنسب لمعالجته.
هذه هي الخطوة الأولى الإلزامية قبل أي عملية OCR.
تعتمد على أدوات النظام (pdfinfo, pdftotext) لتحليل الملف.

المخرج JSON يحتوي:
- type: نوع PDF (text-based | scanned | mixed | protected | invalid)
- pages: عدد الصفحات
- size_mb: الحجم بالميجابايت
- has_arabic: هل يحتوي نصاً عربياً
- recommended_engine: المحرك الموصى به (pdfminer | mistral | vision)
- notes: ملاحظات وتحذيرات`,

  inputSchema: z.object({
    pdfPath: z.string().describe("المسار المطلق لملف PDF المراد تصنيفه"),
  }),

  execute: async ({ pdfPath }) => {
    try {
      const { stdout, stderr } = await runScript("classify-pdf.ts", [pdfPath]);
      if (stderr) {
        console.error(`[skill/classify] ${stderr}`);
      }
      return (
        stdout ||
        JSON.stringify({ success: false, error: "لا مخرجات من سكريبت التصنيف" })
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: `فشل التصنيف: ${msg}` });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// أداة 2: OCR عبر Mistral (ocr-mistral.ts)
// ═══════════════════════════════════════════════════════════════

export const skillOcrMistral = tool({
  description: `استخراج النص من ملف PDF عبر Mistral OCR 3 — المحرك الأساسي بدقة 99%+ للعربية.
يتطلب متغير البيئة MISTRAL_API_KEY.
يُنتج ملف JSON يحتوي نتائج OCR لكل صفحة (markdown + صور مكتشفة).

المدخلات:
- input: مسار ملف PDF
- output: مسار ملف JSON الناتج
- pages: نطاق الصفحات ("all" أو "0-9" أو "0,3,5")

استخدم هذه الأداة بدلاً من أداة MCP convert_document_to_markdown
عندما تريد التحكم الكامل في عملية OCR وحفظ النتائج الخام.`,

  inputSchema: z.object({
    input: z.string().describe("المسار المطلق لملف PDF"),
    output: z.string().describe("المسار المطلق لملف JSON الناتج"),
    pages: z
      .string()
      .default("all")
      .describe('نطاق الصفحات: "all" أو "0-9" أو "0,3,5"'),
  }),

  execute: async ({ input, output, pages }) => {
    try {
      // التحقق من وجود المفتاح
      if (!process.env["MISTRAL_API_KEY"]) {
        return JSON.stringify({
          success: false,
          error: "مفتاح MISTRAL_API_KEY غير موجود في متغيرات البيئة",
        });
      }

      const args = ["--input", input, "--output", output];
      if (pages && pages !== "all") {
        args.push("--pages", pages);
      }

      const { stdout, stderr } = await runScript(
        "ocr-mistral.ts",
        args,
        600_000 // 10 دقائق — ملفات كبيرة قد تستغرق وقتاً
      );

      if (stderr) {
        console.error(`[skill/ocr] ${stderr}`);
      }

      return (
        stdout ||
        JSON.stringify({ success: false, error: "لا مخرجات من سكريبت OCR" })
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: `فشل OCR: ${msg}` });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// أداة 3: كتابة المخرجات (write-output.ts)
// ═══════════════════════════════════════════════════════════════

export const skillWriteOutput = tool({
  description: `تحويل نتائج OCR (ملف JSON) إلى ملف نصي بصيغة TXT أو Markdown.

صيغة TXT: نص خام مع فواصل صفحات بسيطة
صيغة TXT-RAW: نص OCR خام قبل تنسيق الصفحات (بدون ===== أو "الصفحة N")
صيغة MD: نص مُنسَّق مع بيانات وصفية وفهرس وروابط صور

المدخل: ملف JSON ناتج من أداة skill_ocr_mistral`,

  inputSchema: z.object({
    input: z.string().describe("المسار المطلق لملف JSON الناتج من OCR"),
    format: z
      .enum(["txt", "txt-raw", "md"])
      .default("md")
      .describe(
        "صيغة المخرج: txt (legacy بفواصل صفحات) أو txt-raw (قبل التنسيق) أو md (Markdown)"
      ),
    output: z.string().describe("المسار المطلق لملف المخرج"),
  }),

  execute: async ({ input, format, output }) => {
    try {
      const { stdout, stderr } = await runScript("write-output.ts", [
        "--input",
        input,
        "--format",
        format,
        "--output",
        output,
      ]);

      if (stderr) {
        console.error(`[skill/write] ${stderr}`);
      }

      return (
        stdout ||
        JSON.stringify({ success: false, error: "لا مخرجات من سكريبت الكتابة" })
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: `فشل الكتابة: ${msg}` });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// أداة 4: تحسين الصور (enhance-image.ts)
// ═══════════════════════════════════════════════════════════════

export const skillEnhanceImages = tool({
  description: `تحسين جودة صور PDF الممسوحة قبل OCR — يرفع دقة الاستخراج بشكل ملحوظ.

العمليات:
1. تحويل لتدرج الرمادي (grayscale)
2. تطبيع التباين (normalize)
3. تحسين الحدة (sharpen) — مهم للحروف العربية
4. إزالة الضوضاء (denoise)
5. ضبط DPI على 300

يقبل صورة واحدة أو مجلد كامل من الصور.
يتطلب حزمة sharp المثبتة.

استخدم هذه الأداة عندما:
- جودة المسح الضوئي ضعيفة
- النص غير واضح أو مشوّه
- نتائج OCR غير مرضية — حسّن الصور ثم أعد OCR`,

  inputSchema: z.object({
    input: z
      .string()
      .describe("المسار المطلق لصورة واحدة أو مجلد صور (PNG/JPG/TIFF)"),
    output: z
      .string()
      .describe("المسار المطلق للصورة المُحسَّنة أو مجلد الإخراج"),
  }),

  execute: async ({ input, output }) => {
    try {
      const { stdout, stderr } = await runScript("enhance-image.ts", [
        "--input",
        input,
        "--output",
        output,
      ]);

      if (stderr) {
        console.error(`[skill/enhance] ${stderr}`);
      }

      return (
        stdout ||
        JSON.stringify({ success: false, error: "لا مخرجات من سكريبت التحسين" })
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: `فشل التحسين: ${msg}` });
    }
  },
});
