#!/usr/bin/env npx tsx
/**
 * write-output.ts — تحويل نتائج OCR إلى ملف TXT أو Markdown
 *
 * الاستخدام:
 *   npx tsx write-output.ts --input "/path/to/ocr_result.json" --format "md" --output "/path/to/output.md"
 *   npx tsx write-output.ts --input "/path/to/ocr_result.json" --format "txt" --output "/path/to/output.txt"
 *
 * المدخل: ملف JSON ناتج من ocr-mistral.ts أو أي مصدر يتبع نفس الهيكل
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

// ─── أنواع البيانات ───────────────────────────────────────────

interface OcrPageResult {
  index: number;
  markdown: string;
  images: Array<{ id: string; bbox: Record<string, number> }>;
}

interface OcrResult {
  source: string;
  model: string;
  total_pages: number;
  doc_size_bytes: number | null;
  pages: OcrPageResult[];
  processing_time_seconds: number;
}

type OutputFormat = "txt" | "txt-raw" | "md";

// ─── تحليل المعاملات ──────────────────────────────────────────

function parseArgs(): { input: string; format: OutputFormat; output: string } {
  const args = process.argv.slice(2);
  let input = "";
  let format: OutputFormat = "txt";
  let output = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) input = args[++i];
    else if (args[i] === "--format" && args[i + 1]) {
      const f = args[++i].toLowerCase();
      if (f === "md" || f === "markdown") format = "md";
      else if (f === "txt-raw") format = "txt-raw";
      else format = "txt";
    } else if (args[i] === "--output" && args[i + 1]) output = args[++i];
  }

  if (!input || !output) {
    console.error(
      "الاستخدام: npx tsx write-output.ts --input <json> --format <txt|txt-raw|md> --output <ملف>"
    );
    process.exit(1);
  }

  return { input, format, output };
}

// ─── مولّدات المخرجات ─────────────────────────────────────────

/** كتابة مخرج نصي خام */
function generateTxt(data: OcrResult): string {
  const separator = "=".repeat(60);
  const lines: string[] = [];

  for (const page of data.pages) {
    const pageNum = page.index + 1;
    lines.push(separator);
    lines.push(`الصفحة ${pageNum}`);
    lines.push(separator);
    lines.push("");
    lines.push(page.markdown.trim());
    lines.push("");
    lines.push("");
  }

  return lines.join("\n");
}

/** كتابة مخرج نصي خام قبل أي تنسيق صفحات */
function generateTxtRaw(data: OcrResult): string {
  return data.pages
    .map((page) => page.markdown.trim())
    .filter((pageText) => pageText.length > 0)
    .join("\n\n");
}

/** كتابة مخرج Markdown مع بنية وبيانات وصفية */
function generateMarkdown(data: OcrResult): string {
  const lines: string[] = [];

  // ترويسة المستند
  lines.push(`# ${data.source}`);
  lines.push("");
  lines.push(`> **المحرك:** \`${data.model}\``);
  lines.push(`> **عدد الصفحات:** ${data.total_pages}`);
  if (data.processing_time_seconds > 0) {
    lines.push(`> **وقت المعالجة:** ${data.processing_time_seconds} ثانية`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // فهرس الصفحات (للملفات الكبيرة)
  if (data.total_pages > 10) {
    lines.push("## فهرس الصفحات");
    lines.push("");
    for (const page of data.pages) {
      const pageNum = page.index + 1;
      lines.push(`- [الصفحة ${pageNum}](#الصفحة-${pageNum})`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // محتوى الصفحات
  for (const page of data.pages) {
    const pageNum = page.index + 1;
    lines.push(`## الصفحة ${pageNum}`);
    lines.push("");
    lines.push(page.markdown.trim());
    lines.push("");

    // إشارة للصور المكتشفة
    if (page.images.length > 0) {
      lines.push(`> *تم اكتشاف ${page.images.length} صورة في هذه الصفحة*`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── المنطق الرئيسي ──────────────────────────────────────────

function main(): void {
  const { input, format, output } = parseArgs();

  // قراءة نتائج OCR
  let data: OcrResult;
  try {
    const raw = readFileSync(input, "utf-8");
    data = JSON.parse(raw) as OcrResult;
  } catch (err: any) {
    console.error(`فشل قراءة ملف الإدخال: ${err.message}`);
    process.exit(1);
  }

  if (!data.pages || data.pages.length === 0) {
    console.error("الملف لا يحتوي صفحات — تحقق من نتائج OCR");
    process.exit(1);
  }

  // توليد المخرج
  const content =
    format === "md"
      ? generateMarkdown(data)
      : format === "txt-raw"
        ? generateTxtRaw(data)
        : generateTxt(data);

  // كتابة الملف
  writeFileSync(output, content, "utf-8");

  const sizeKb = Math.round(Buffer.byteLength(content, "utf-8") / 1024);

  console.error(`تم الكتابة: ${output}`);
  console.error(`الصيغة: ${format.toUpperCase()}`);
  console.error(`الصفحات: ${data.pages.length}`);
  console.error(`الحجم: ${sizeKb} KB`);

  // ملخص على stdout
  console.log(
    JSON.stringify({
      success: true,
      format,
      pages: data.pages.length,
      output_path: output,
      size_kb: sizeKb,
    })
  );
}

main();
