#!/usr/bin/env npx tsx
/**
 * enhance-image.ts — تحسين جودة صور PDF الممسوحة قبل OCR
 *
 * الاستخدام:
 *   npx tsx enhance-image.ts --input "/tmp/ocr_pages" --output "/tmp/ocr_enhanced"
 *   npx tsx enhance-image.ts --input "/path/to/single.png" --output "/path/to/enhanced.png"
 *
 * العمليات:
 *   1. تحسين التباين (contrast)
 *   2. تحسين الحدة (sharpness)
 *   3. تحويل لتدرج الرمادي (grayscale) — يحسّن دقة OCR للنص
 *   4. تطبيق عتبة تكيفية (adaptive threshold) — لفصل النص عن الخلفية
 *   5. إزالة الضوضاء (denoise)
 */

import { readdirSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ─── تحليل المعاملات ──────────────────────────────────────────

function parseArgs(): { input: string; output: string } {
  const args = process.argv.slice(2);
  let input = "";
  let output = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) input = args[++i];
    else if (args[i] === "--output" && args[i + 1]) output = args[++i];
  }

  if (!input || !output) {
    console.error(
      "الاستخدام: npx tsx enhance-image.ts --input <مجلد_أو_صورة> --output <مجلد_أو_صورة>"
    );
    process.exit(1);
  }

  return { input, output };
}

// ─── تحسين صورة واحدة ────────────────────────────────────────

async function enhanceImage(
  inputPath: string,
  outputPath: string
): Promise<void> {
  // استيراد ديناميكي لـ sharp
  const sharp = (await import("sharp")).default;

  await sharp(inputPath)
    // 1. تحويل لتدرج الرمادي — يُحسّن التمييز بين النص والخلفية
    .grayscale()
    // 2. تطبيع الألوان — يوازن التباين تلقائياً
    .normalize()
    // 3. تحسين الحدة — يُبرز حواف الحروف العربية
    .sharpen({
      sigma: 1.5,
      m1: 1.0, // flat areas sharpening
      m2: 2.0, // jagged areas sharpening
    })
    // 4. تعديل التباين والسطوع
    .modulate({
      brightness: 1.05, // زيادة طفيفة في السطوع
    })
    // 5. إزالة الضوضاء عبر median filter
    .median(3)
    // 6. ضمان DPI مناسب (300)
    .withMetadata({ density: 300 })
    .png({ quality: 95, compressionLevel: 6 })
    .toFile(outputPath);
}

// ─── المنطق الرئيسي ──────────────────────────────────────────

async function main(): Promise<void> {
  const { input, output } = parseArgs();

  const inputStat = statSync(input);

  if (inputStat.isFile()) {
    // معالجة صورة واحدة
    console.error(`تحسين: ${basename(input)}`);
    await enhanceImage(input, output);
    console.error(`تم: ${output}`);
    console.log(JSON.stringify({ success: true, files_processed: 1 }));
    return;
  }

  if (inputStat.isDirectory()) {
    // معالجة مجلد صور
    if (!existsSync(output)) {
      mkdirSync(output, { recursive: true });
    }

    const imageFiles = readdirSync(input).filter((f) => {
      const ext = extname(f).toLowerCase();
      return [".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp"].includes(ext);
    });

    if (imageFiles.length === 0) {
      console.error("لا توجد صور في المجلد المحدد");
      process.exit(1);
    }

    console.error(`معالجة ${imageFiles.length} صورة...`);
    let processed = 0;

    for (const file of imageFiles) {
      const inPath = join(input, file);
      const outPath = join(output, file);

      try {
        await enhanceImage(inPath, outPath);
        processed++;

        if (processed % 10 === 0) {
          console.error(`  تقدم: ${processed}/${imageFiles.length}`);
        }
      } catch (err: any) {
        console.error(`  فشل تحسين ${file}: ${err.message}`);
      }
    }

    console.error(
      `تم تحسين ${processed}/${imageFiles.length} صورة → ${output}`
    );
    console.log(
      JSON.stringify({
        success: true,
        files_processed: processed,
        files_total: imageFiles.length,
        output_dir: output,
      })
    );
    return;
  }

  console.error("المدخل ليس ملفاً ولا مجلداً صالحاً");
  process.exit(1);
}

main();
