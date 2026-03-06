#!/usr/bin/env npx tsx
/**
 * classify-pdf.ts — تصنيف ملف PDF وتحديد المسار الأنسب لمعالجته
 *
 * الاستخدام:
 *   npx tsx classify-pdf.ts "/path/to/input.pdf"
 *
 * المخرج: JSON على stdout يتضمن نوع الملف والتوصية
 */

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename } from "node:path";

// ─── أنواع البيانات ───────────────────────────────────────────

interface ClassificationResult {
  /** نوع الملف: نصي / ممسوح / مختلط / محمي / غير صالح */
  type: "text-based" | "scanned" | "mixed" | "protected" | "invalid";
  /** عدد الصفحات */
  pages: number;
  /** حجم الملف بالميجابايت */
  size_mb: number;
  /** اسم الملف */
  filename: string;
  /** هل يحتوي نصاً عربياً */
  has_arabic: boolean;
  /** المحرك الموصى به */
  recommended_engine: "pdfminer" | "mistral" | "vision";
  /** ملاحظات إضافية */
  notes: string[];
}

// ─── دوال مساعدة ──────────────────────────────────────────────

/** استخراج معلومات PDF عبر pdfinfo */
function getPdfInfo(pdfPath: string): Record<string, string> {
  try {
    const output = execFileSync("pdfinfo", [pdfPath], {
      encoding: "utf-8",
      timeout: 10_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const info: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        info[key] = value;
      }
    }
    return info;
  } catch {
    return {};
  }
}

/** محاولة استخراج نص خام من PDF عبر pdftotext */
function extractRawText(pdfPath: string, maxPages = 3): string {
  try {
    return execFileSync("pdftotext", ["-l", String(maxPages), pdfPath, "-"], {
      encoding: "utf-8",
      timeout: 15_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

/** حساب نسبة الأحرف العربية في النص */
function arabicRatio(text: string): number {
  if (text.length === 0) return 0;
  const arabicChars = [...text].filter(
    (c) => c.charCodeAt(0) >= 0x0600 && c.charCodeAt(0) <= 0x06ff
  ).length;
  return arabicChars / text.length;
}

/** حساب نسبة الأحرف القابلة للطباعة (غير المسافات) */
function printableRatio(text: string): number {
  const stripped = text.replace(/\s/g, "");
  return stripped.length;
}

// ─── المنطق الرئيسي ──────────────────────────────────────────

function classifyPdf(pdfPath: string): ClassificationResult {
  const notes: string[] = [];

  // التحقق من وجود الملف
  let fileSize: number;
  try {
    fileSize = statSync(pdfPath).size;
  } catch {
    return {
      type: "invalid",
      pages: 0,
      size_mb: 0,
      filename: basename(pdfPath),
      has_arabic: false,
      recommended_engine: "vision",
      notes: ["الملف غير موجود أو لا يمكن الوصول إليه"],
    };
  }

  const sizeMb = Math.round((fileSize / (1024 * 1024)) * 100) / 100;
  const filename = basename(pdfPath);

  // استخراج معلومات PDF
  const info = getPdfInfo(pdfPath);
  const pages = parseInt(info["Pages"] ?? "0", 10);

  // فحص الحماية
  if (info["Encrypted"] === "yes") {
    return {
      type: "protected",
      pages,
      size_mb: sizeMb,
      filename,
      has_arabic: false,
      recommended_engine: "vision",
      notes: ["الملف محمي بكلمة مرور — يتطلب فك التشفير أولاً"],
    };
  }

  // تحذير الحجم
  if (sizeMb > 50) {
    notes.push(
      `حجم الملف كبير (${sizeMb}MB) — قد يتجاوز حد Mistral API (50MB)`
    );
  }

  // تحذير الصفحات
  if (pages > 1000) {
    notes.push(`عدد الصفحات كبير (${pages}) — يتطلب معالجة على دفعات`);
  } else if (pages > 50) {
    notes.push(`${pages} صفحة — يُنصح بسؤال المستخدم قبل البدء`);
  }

  // محاولة استخراج نص
  const rawText = extractRawText(pdfPath);
  const printable = printableRatio(rawText);
  const arRatio = arabicRatio(rawText);
  const hasArabic = arRatio > 0.05;

  // تحديد النوع
  let type: ClassificationResult["type"];
  let engine: ClassificationResult["recommended_engine"];

  if (printable > 200) {
    // يوجد نص كافٍ — PDF نصي أو مختلط
    if (printable > 500) {
      type = "text-based";
      engine = "pdfminer";
      notes.push("PDF نصي — يمكن الاستخراج المباشر بدون OCR");
    } else {
      type = "mixed";
      engine = "mistral";
      notes.push("PDF مختلط — بعض الصفحات نصية وبعضها ممسوح");
    }
  } else {
    // لا يوجد نص كافٍ — PDF ممسوح ضوئياً
    type = "scanned";
    engine = "mistral";
    notes.push("PDF ممسوح ضوئياً — يتطلب OCR كامل");
  }

  // إذا لم يتوفر مفتاح Mistral
  if (engine === "mistral" && !process.env["MISTRAL_API_KEY"]) {
    notes.push("⚠ مفتاح MISTRAL_API_KEY غير متوفر — سيُستخدم المحرك الاحتياطي");
  }

  return {
    type,
    pages,
    size_mb: sizeMb,
    filename,
    has_arabic: hasArabic,
    recommended_engine: engine,
    notes,
  };
}

// ─── نقطة الدخول ──────────────────────────────────────────────

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error("الاستخدام: npx tsx classify-pdf.ts <مسار_ملف_PDF>");
  process.exit(1);
}

const result = classifyPdf(pdfPath);
console.log(JSON.stringify(result, null, 2));
