#!/usr/bin/env tsx
/**
 * DOCX to DOC Converter (TypeScript + Word COM)
 *
 * تحويل ملفات DOCX إلى DOC باستخدام Microsoft Word COM Automation
 *
 * Usage:
 *   npx tsx server/docx-to-doc.final.ts input.docx [output.doc] [--overwrite]
 *
 * Requirements:
 *   - Microsoft Word installed
 *   - npm install winax
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "node:url";

// Type definitions for winax
interface WordApplication {
  Visible: boolean;
  Documents: {
    Open(filename: string): WordDocument;
  };
  Quit(): void;
}

interface WordDocument {
  SaveAs(filename: string, fileFormat: number): void;
  Close(saveChanges: boolean): void;
}

// Word format constants
const WdFormatDocument97 = 0; // DOC format

const writeInfo = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeError = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function convertDocxToDoc(
  inputPath: string,
  outputPath?: string,
  overwrite: boolean = false
): Promise<void> {
  // Resolve absolute paths
  const absInputPath = path.resolve(inputPath);

  if (!fs.existsSync(absInputPath)) {
    throw new Error(`Input file not found: ${absInputPath}`);
  }

  // Determine output path
  const absOutputPath = outputPath
    ? path.resolve(outputPath)
    : absInputPath.replace(/\.docx$/i, ".doc");

  // Check if output exists
  if (fs.existsSync(absOutputPath) && !overwrite) {
    throw new Error(
      `Output file already exists: ${absOutputPath}\nUse --overwrite to replace it.`
    );
  }

  writeInfo(`📄 Input:  ${absInputPath}`);
  writeInfo(`💾 Output: ${absOutputPath}`);
  writeInfo("🔄 Converting...");

  let wordApp: WordApplication | null = null;
  let doc: WordDocument | null = null;

  try {
    // Import winax dynamically (ESM-safe)
    const winaxModule = await import("winax");
    const winax =
      (winaxModule as unknown as { default?: { Object: unknown } }).default ??
      (winaxModule as unknown as { Object: unknown });

    // Create Word Application COM object
    wordApp = new winax.Object("Word.Application", {
      activate: false,
      type: true,
    });

    // Hide Word window
    wordApp.Visible = false;

    // Open document
    doc = wordApp.Documents.Open(absInputPath);

    // Save as DOC format
    doc.SaveAs(absOutputPath, WdFormatDocument97);

    // Close document
    doc.Close(false);

    writeInfo("✅ Conversion successful!");

    // Get file size
    const stats = fs.statSync(absOutputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    writeInfo(`📊 Output size: ${sizeKB} KB`);
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    writeError(`❌ Error: ${message}`);

    if (message.includes("winax")) {
      writeError("\n💡 Install winax: npm install winax");
    }

    if (message.includes("Word.Application")) {
      writeError("\n💡 Make sure Microsoft Word is installed.");
    }

    throw error;
  } finally {
    // Cleanup
    try {
      if (doc) {
        doc.Close(false);
      }
      if (wordApp) {
        wordApp.Quit();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    writeInfo(`
DOCX to DOC Converter (TypeScript + Word COM)

Usage:
  npx tsx server/docx-to-doc.final.ts <input.docx> [output.doc] [--overwrite]

Arguments:
  input.docx      Path to input DOCX file
  output.doc      (Optional) Output DOC file path
                  Default: same name as input with .doc extension
  --overwrite     Overwrite output file if it exists

Examples:
  npx tsx server/docx-to-doc.final.ts document.docx
  npx tsx server/docx-to-doc.final.ts document.docx output.doc
  npx tsx server/docx-to-doc.final.ts document.docx --overwrite

Requirements:
  - Microsoft Word must be installed
  - Run: npm install winax
    `);
    process.exit(0);
  }

  const inputPath = args[0];
  const hasOverwrite = args.includes("--overwrite");

  // Find output path (if provided and not --overwrite)
  const outputPath = args.find(
    (arg, idx) => idx > 0 && arg !== "--overwrite" && !arg.startsWith("-")
  );

  try {
    await convertDocxToDoc(inputPath, outputPath, hasOverwrite);
    process.exit(0);
  } catch (error: unknown) {
    writeError(`\n❌ Conversion failed: ${toErrorMessage(error)}`);
    process.exit(1);
  }
}

const isMainModule = (): boolean => {
  const currentFile = fileURLToPath(import.meta.url);
  const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return entryFile === path.resolve(currentFile);
};

// Run if called directly
if (isMainModule()) {
  main();
}

export { convertDocxToDoc };
