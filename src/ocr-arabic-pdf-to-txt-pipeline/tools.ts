/**
 * tools.ts — أدوات الوكيل المحلية (بدون MCP)
 *
 * أدوات مساعدة للقراءة والكتابة وتصنيف الملفات،
 * تعمل مباشرةً داخل الوكيل بدون الحاجة لخادم MCP خارجي.
 */

import { tool } from "ai";
import { z } from "zod";
import { readFile, writeFile, stat, readdir, mkdir } from "node:fs/promises";
import { basename, extname, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ClassificationResult } from "./types";

// ─── أداة قراءة الملفات ─────────────────────────────────────

export const readFileTool = tool({
  description:
    "قراءة محتوى ملف من نظام الملفات. يدعم الملفات النصية (txt, md, json, csv). للملفات الثنائية يُعيد معلومات وصفية فقط.",
  inputSchema: z.object({
    filePath: z.string().describe("المسار المطلق للملف المراد قراءته"),
    encoding: z
      .enum(["utf-8", "base64"])
      .default("utf-8")
      .describe("ترميز القراءة — utf-8 للنصوص، base64 للثنائيات"),
  }),
  execute: async ({ filePath, encoding }) => {
    try {
      const fileStat = await stat(filePath);
      const sizeKb = Math.round(fileStat.size / 1024);
      const ext = extname(filePath).toLowerCase();

      // ملفات PDF و الصور — إعادة معلومات وصفية فقط
      if ([".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"].includes(ext)) {
        return JSON.stringify({
          success: true,
          type: "binary",
          filename: basename(filePath),
          extension: ext,
          size_kb: sizeKb,
          message: `ملف ثنائي (${ext}) — الحجم: ${sizeKb} KB. استخدم أداة OCR للمعالجة.`,
        });
      }

      // ملفات نصية
      const content = await readFile(filePath, encoding as BufferEncoding);
      const lineCount = encoding === "utf-8" ? content.split("\n").length : 0;

      return JSON.stringify({
        success: true,
        type: "text",
        filename: basename(filePath),
        extension: ext,
        size_kb: sizeKb,
        line_count: lineCount,
        content:
          content.length > 50_000
            ? content.substring(0, 50_000) +
              "\n\n... [تم اقتطاع المحتوى — الملف طويل جداً]"
            : content,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
});

// ─── أداة كتابة الملفات ─────────────────────────────────────

export const writeFileTool = tool({
  description:
    "كتابة محتوى نصي إلى ملف. يُنشئ المجلدات تلقائياً إن لم تكن موجودة. يتجنب الكتابة فوق الملفات الموجودة.",
  inputSchema: z.object({
    filePath: z.string().describe("المسار المطلق لملف الإخراج"),
    content: z.string().describe("المحتوى المراد كتابته"),
    overwrite: z
      .boolean()
      .default(false)
      .describe("السماح بالكتابة فوق ملف موجود"),
  }),
  execute: async ({ filePath, content, overwrite }) => {
    try {
      // إنشاء المجلد إن لم يكن موجوداً
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });

      // التحقق من وجود الملف
      let finalPath = filePath;
      if (!overwrite) {
        try {
          await stat(filePath);
          // الملف موجود — إضافة لاحقة رقمية
          const ext = extname(filePath);
          const base = filePath.slice(0, -ext.length);
          let counter = 1;
          while (true) {
            finalPath = `${base}_${counter}${ext}`;
            try {
              await stat(finalPath);
              counter++;
            } catch {
              break; // الملف غير موجود — يمكن الاستخدام
            }
          }
        } catch {
          // الملف غير موجود — المسار الأصلي صالح
        }
      }

      await writeFile(finalPath, content, "utf-8");
      const sizeKb = Math.round(Buffer.byteLength(content, "utf-8") / 1024);

      return JSON.stringify({
        success: true,
        path: finalPath,
        size_kb: sizeKb,
        lines: content.split("\n").length,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
});

// ─── أداة سرد الملفات ───────────────────────────────────────

export const listFilesTool = tool({
  description:
    "سرد الملفات في مجلد محدد مع تصفية اختيارية حسب الامتداد. مفيد لاكتشاف ملفات PDF في مجلد.",
  inputSchema: z.object({
    dirPath: z.string().describe("المسار المطلق للمجلد"),
    extensions: z
      .array(z.string())
      .optional()
      .describe('تصفية حسب الامتداد (مثال: [".pdf", ".txt"])'),
  }),
  execute: async ({ dirPath, extensions }) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const files: Array<{
        name: string;
        type: string;
        size_kb?: number;
      }> = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (extensions && !extensions.includes(ext)) continue;

          try {
            const fileStat = await stat(join(dirPath, entry.name));
            files.push({
              name: entry.name,
              type: ext,
              size_kb: Math.round(fileStat.size / 1024),
            });
          } catch {
            files.push({ name: entry.name, type: ext });
          }
        }
      }

      return JSON.stringify({
        success: true,
        directory: dirPath,
        total_files: files.length,
        files,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
});

// ─── أداة تصنيف PDF ─────────────────────────────────────────

export const classifyPdfTool = tool({
  description:
    "تصنيف ملف PDF وتحديد نوعه (نصي / ممسوح / مختلط / محمي) والمحرك الأنسب لمعالجته. الخطوة الأولى قبل أي عملية OCR.",
  inputSchema: z.object({
    pdfPath: z.string().describe("المسار المطلق لملف PDF"),
  }),
  execute: async ({ pdfPath }) => {
    try {
      const fileStat = await stat(pdfPath);
      const sizeMb = Math.round((fileStat.size / (1024 * 1024)) * 100) / 100;
      const filename = basename(pdfPath);
      const notes: string[] = [];

      // محاولة استخراج معلومات PDF عبر pdfinfo
      let pages = 0;
      let isEncrypted = false;
      try {
        const output = execFileSync("pdfinfo", [pdfPath], {
          encoding: "utf-8",
          timeout: 10_000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        for (const line of output.split("\n")) {
          if (line.startsWith("Pages:")) {
            pages = parseInt(line.split(":")[1]?.trim() ?? "0", 10);
          }
          if (line.startsWith("Encrypted:") && line.includes("yes")) {
            isEncrypted = true;
          }
        }
      } catch {
        notes.push("لم يُعثر على pdfinfo — التصنيف مبني على حجم الملف فقط");
      }

      if (isEncrypted) {
        return JSON.stringify({
          type: "protected",
          pages,
          size_mb: sizeMb,
          filename,
          has_arabic: false,
          recommended_engine: "vision",
          notes: ["الملف محمي بكلمة مرور — يتطلب فك التشفير أولاً"],
        } satisfies ClassificationResult);
      }

      // محاولة استخراج نص خام
      let rawText = "";
      try {
        rawText = execFileSync("pdftotext", ["-l", "3", pdfPath, "-"], {
          encoding: "utf-8",
          timeout: 15_000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        notes.push("لم يُعثر على pdftotext — يُفترض أن الملف ممسوح ضوئياً");
      }

      // تحليل النص المستخرج
      const printableCount = rawText.replace(/\s/g, "").length;
      const arabicChars = [...rawText].filter(
        (c) => c.charCodeAt(0) >= 0x0600 && c.charCodeAt(0) <= 0x06ff
      ).length;
      const hasArabic =
        rawText.length > 0 && arabicChars / rawText.length > 0.05;

      // تحديد النوع
      let type: ClassificationResult["type"];
      let engine: ClassificationResult["recommended_engine"];

      if (printableCount > 500) {
        type = "text-based";
        engine = "pdfminer";
        notes.push("PDF نصي — يمكن الاستخراج المباشر بدون OCR");
      } else if (printableCount > 200) {
        type = "mixed";
        engine = "mistral";
        notes.push("PDF مختلط — بعض الصفحات نصية وبعضها ممسوح");
      } else {
        type = "scanned";
        engine = "mistral";
        notes.push("PDF ممسوح ضوئياً — يتطلب OCR كامل");
      }

      if (sizeMb > 50) {
        notes.push(`حجم الملف كبير (${sizeMb}MB) — قد يتجاوز حد Mistral API`);
      }
      if (pages > 50) {
        notes.push(`${pages} صفحة — قد يستغرق وقتاً طويلاً`);
      }

      if (!process.env["MISTRAL_API_KEY"] && engine === "mistral") {
        notes.push(
          "⚠ مفتاح MISTRAL_API_KEY غير متوفر — ستُستخدم طبقة احتياطية"
        );
      }

      return JSON.stringify({
        type,
        pages,
        size_mb: sizeMb,
        filename,
        has_arabic: hasArabic,
        recommended_engine: engine,
        notes,
      } satisfies ClassificationResult);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        type: "invalid",
        pages: 0,
        size_mb: 0,
        filename: basename(pdfPath),
        has_arabic: false,
        recommended_engine: "vision",
        notes: [`خطأ في التصنيف: ${msg}`],
      } satisfies ClassificationResult);
    }
  },
});
