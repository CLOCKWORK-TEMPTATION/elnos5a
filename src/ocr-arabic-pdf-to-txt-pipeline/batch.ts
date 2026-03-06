#!/usr/bin/env npx tsx
/**
 * batch.ts — معالجة دفعية لعدة ملفات PDF
 *
 * يقرأ مجلداً كاملاً ويُعالج جميع ملفات PDF الموجودة فيه.
 * يستخدم نفس بنية الوكيل مع تكرار على كل ملف.
 *
 * الاستخدام:
 *   npx tsx src/batch.ts /path/to/pdf/folder
 *   npx tsx src/batch.ts /path/to/pdf/folder --output /path/to/output --format txt
 */

import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openai } from "@ai-sdk/openai";
import { readdir, mkdir } from "node:fs/promises";
import { join, extname, basename, resolve } from "node:path";

import { buildAgentConfig, validateEnvironment } from "./config";

// ─── ألوان الطرفية ──────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const;

function log(prefix: string, color: string, msg: string): void {
  console.error(`${color}${C.bold}[${prefix}]${C.reset} ${msg}`);
}

// ─── تحليل المعاملات ────────────────────────────────────────

interface BatchArgs {
  inputDir: string;
  outputDir: string;
  format: "txt" | "md";
}

function parseBatchArgs(): BatchArgs {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "الاستخدام: npx tsx src/batch.ts <مجلد_PDF> [--output <مجلد>] [--format txt|md]"
    );
    process.exit(1);
  }

  const inputDir = resolve(args[0]);
  let outputDir = "";
  let format: "txt" | "md" = "md";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputDir = resolve(args[++i]);
    } else if (args[i] === "--format" && args[i + 1]) {
      format = args[++i] === "txt" ? "txt" : "md";
    }
  }

  if (!outputDir) {
    outputDir = join(inputDir, "ocr_output");
  }

  return { inputDir, outputDir, format };
}

// ─── المنطق الرئيسي ────────────────────────────────────────

async function main(): Promise<void> {
  const { inputDir, outputDir, format } = parseBatchArgs();
  const config = buildAgentConfig();

  log("دفعي", C.green, `مجلد الإدخال: ${inputDir}`);
  log("دفعي", C.green, `مجلد الإخراج: ${outputDir}`);
  log("دفعي", C.green, `الصيغة: ${format.toUpperCase()}`);

  // التحقق من البيئة
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    log("خطأ", C.red, `مفاتيح مفقودة: ${envCheck.missing.join(", ")}`);
    process.exit(1);
  }

  // اكتشاف ملفات PDF
  const entries = await readdir(inputDir);
  const pdfFiles = entries.filter((f) => extname(f).toLowerCase() === ".pdf");

  if (pdfFiles.length === 0) {
    log("خطأ", C.yellow, "لا توجد ملفات PDF في المجلد المحدد");
    process.exit(0);
  }

  log("دفعي", C.cyan, `تم اكتشاف ${pdfFiles.length} ملف PDF`);

  // إنشاء مجلد الإخراج
  await mkdir(outputDir, { recursive: true });

  // إنشاء عميل MCP
  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let mcpTools: Record<string, unknown> = {};

  try {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", config.mcpServerPath],
      env: {
        ...process.env,
        MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"] ?? "",
        OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "",
      },
    });
    mcpClient = await createMCPClient({ transport });
    mcpTools = await mcpClient.tools();
    log("MCP", C.green, "تم الاتصال بخادم OCR");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    log("خطأ", C.red, `فشل الاتصال بخادم MCP: ${msg}`);
    process.exit(1);
  }

  // معالجة كل ملف
  const results: Array<{
    file: string;
    success: boolean;
    output?: string;
    error?: string;
    timeMs: number;
  }> = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfFile = pdfFiles[i]!;
    const pdfPath = join(inputDir, pdfFile);
    const outputName = basename(pdfFile, ".pdf") + "." + format;
    const outputPath = join(outputDir, outputName);

    log("تقدم", C.cyan, `[${i + 1}/${pdfFiles.length}] ${pdfFile}`);

    const startTime = Date.now();

    try {
      await generateText({
        model: openai(config.agentModel),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: mcpTools as any,
        stopWhen: stepCountIs(5),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `حوّل هذا الملف إلى markdown:
inputPath: ${pdfPath}
outputPath: ${outputPath}
استخدم الإعدادات الافتراضية للتطبيع.`,
              },
            ],
          },
        ],
      });

      const elapsed = Date.now() - startTime;
      results.push({
        file: pdfFile,
        success: true,
        output: outputPath,
        timeMs: elapsed,
      });
      log(
        "نجاح",
        C.green,
        `${pdfFile} → ${outputName} (${(elapsed / 1000).toFixed(1)}ث)`
      );
    } catch (error: unknown) {
      const elapsed = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        file: pdfFile,
        success: false,
        error: msg,
        timeMs: elapsed,
      });
      log("فشل", C.red, `${pdfFile}: ${msg}`);
    }
  }

  // ملخص النتائج
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalTimeMs = results.reduce((sum, r) => sum + r.timeMs, 0);

  console.error();
  log("ملخص", C.green, "═".repeat(50));
  log("ملخص", C.green, `الإجمالي: ${pdfFiles.length} ملف`);
  log("ملخص", C.green, `نجاح: ${succeeded} | فشل: ${failed}`);
  log("ملخص", C.green, `الوقت الكلي: ${(totalTimeMs / 1000).toFixed(1)} ثانية`);
  log("ملخص", C.green, `مجلد الإخراج: ${outputDir}`);

  if (failed > 0) {
    log("ملخص", C.red, "الملفات الفاشلة:");
    for (const r of results.filter((r) => !r.success)) {
      log("ملخص", C.red, `  - ${r.file}: ${r.error}`);
    }
  }

  // تنظيف
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // تجاهل
    }
  }

  // رمز الخروج
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("خطأ غير متوقع:", error);
  process.exit(1);
});
