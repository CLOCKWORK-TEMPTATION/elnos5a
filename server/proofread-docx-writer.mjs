/**
 * @module server/proofread-docx-writer
 * @description يُولّد نسختين من ملف DOCX بعد مرحلة vision-proofread:
 *
 *  1. **raw** — كل سطر في paragraph مستقل، بدون أي تنسيق
 *  2. **formatted** — عناوين مشاهد كـ Heading، أسماء شخصيات Bold،
 *     إرشادات أكشن بخط عادي، حوار بخط مائل
 *
 * الملفات تُحفظ في مجلد `server/proofread-output/` بتسمية:
 *   `{filename}-raw.docx`  و  `{filename}-formatted.docx`
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// logger بسيط — بيستخدم pino لو موجود، وإلا console
let logger;
try {
  const pino = (await import("pino")).default;
  logger = pino({ name: "proofread-docx-writer", level: "info" });
} catch {
  logger = {
    info: (obj, msg) =>
      console.warn(
        `[proofread-docx] INFO: ${msg || ""}`,
        typeof obj === "string" ? obj : ""
      ),
    warn: (obj, msg) =>
      console.warn(
        `[proofread-docx] WARN: ${msg || ""}`,
        typeof obj === "string" ? obj : ""
      ),
    error: (obj, msg) =>
      console.error(
        `[proofread-docx] ERROR: ${msg || ""}`,
        typeof obj === "string" ? obj : ""
      ),
  };
}

const OUTPUT_DIR = resolve(__dirname, "proofread-output");

// ─── أنماط التعرّف على عناصر السيناريو ────────────────────────

const SCENE_HEADER_RE = /^(?:مشهد|مسـاهد|scene)\s*[0-9٠-٩]+/i;
const SCENE_LOCATION_RE = /^(?:نهار|ليل|صباح|مساء|غروب|فجر|شروق)\s*[-–—]/i;
const LOCATION_LINE_RE =
  /^(?:شقة|بيت|منزل|غرفة|شارع|مكتب|مستشفى|مسجد|كنيسة|مطعم|فندق|سيارة|طريق)/;
const CHARACTER_DIALOGUE_RE = /^([^\s:：]{1,20})\s*[:：]\s*(.+)$/;
const BULLET_CHARACTER_RE = /^[▪•●○]\s*([^\s:：]{1,20})\s*[:：]\s*(.+)$/;
const ACTION_CUE_RE = /^[-–—]\s+/;
const BASMALA_RE = /بسم\s*(?:الله|اللّه|اهلل)/;
const TRANSITION_RE = /^(?:قطع|CUT|FADE|انتقال)/i;

/**
 * يُصنّف سطراً واحداً إلى نوع سيناريو تقريبي.
 * التصنيف هنا مبسّط — الهدف منه التنسيق وليس الدقة الكاملة.
 */
const classifyLineSimple = (line) => {
  const trimmed = (line ?? "").replace(/[\u200f\u200e\ufeff]/g, "").trim();
  if (!trimmed) return { type: "empty", text: trimmed };

  if (BASMALA_RE.test(trimmed)) {
    return { type: "basmala", text: trimmed };
  }

  if (SCENE_HEADER_RE.test(trimmed)) {
    return { type: "scene-header", text: trimmed };
  }

  if (SCENE_LOCATION_RE.test(trimmed)) {
    return { type: "scene-location", text: trimmed };
  }

  if (LOCATION_LINE_RE.test(trimmed)) {
    return { type: "scene-location", text: trimmed };
  }

  if (TRANSITION_RE.test(trimmed)) {
    return { type: "transition", text: trimmed };
  }

  // شخصية + حوار في سطر واحد (بـ bullet أو بدون)
  const bulletMatch = trimmed.match(BULLET_CHARACTER_RE);
  if (bulletMatch) {
    return {
      type: "character-dialogue",
      character: bulletMatch[1].trim(),
      dialogue: bulletMatch[2].trim(),
      text: trimmed,
    };
  }

  const charMatch = trimmed.match(CHARACTER_DIALOGUE_RE);
  if (charMatch) {
    const namePart = charMatch[1].trim();
    // تأكد إن الاسم مش طويل جداً ومش جملة عادية
    if (namePart.length <= 15 && !/[.!?؟،]/.test(namePart)) {
      return {
        type: "character-dialogue",
        character: namePart,
        dialogue: charMatch[2].trim(),
        text: trimmed,
      };
    }
  }

  // أكشن (يبدأ بشرطة)
  if (ACTION_CUE_RE.test(trimmed)) {
    return {
      type: "action-cue",
      text: trimmed.replace(ACTION_CUE_RE, "").trim(),
    };
  }

  return { type: "narrative", text: trimmed };
};

// ─── توليد DOCX خام ───────────────────────────────────────────

const buildRawDocx = (text, _filename) => {
  const lines = text.split(/\r?\n/);
  const paragraphs = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // سطر فارغ → paragraph فارغ
      paragraphs.push(new Paragraph({ text: "" }));
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: trimmed,
            font: "Simplified Arabic",
            size: 24, // 12pt
            rightToLeft: true,
          }),
        ],
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
      })
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // Letter
          },
        },
        children: paragraphs,
      },
    ],
  });
};

// ─── توليد DOCX مُنسّق ───────────────────────────────────────

const buildFormattedDocx = (text, _filename) => {
  const lines = text.split(/\r?\n/);
  const paragraphs = [];

  for (const line of lines) {
    const classified = classifyLineSimple(line);

    if (classified.type === "empty") {
      paragraphs.push(new Paragraph({ text: "" }));
      continue;
    }

    if (classified.type === "basmala") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: classified.text,
              font: "Simplified Arabic",
              size: 28, // 14pt
              bold: true,
              rightToLeft: true,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          bidirectional: true,
          alignment: AlignmentType.CENTER,
        })
      );
      continue;
    }

    if (classified.type === "scene-header") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: classified.text,
              font: "Simplified Arabic",
              size: 26, // 13pt
              bold: true,
              rightToLeft: true,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 240, after: 60 },
        })
      );
      continue;
    }

    if (classified.type === "scene-location") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: classified.text,
              font: "Simplified Arabic",
              size: 24,
              bold: true,
              italics: true,
              rightToLeft: true,
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 60, after: 120 },
        })
      );
      continue;
    }

    if (classified.type === "transition") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: classified.text,
              font: "Simplified Arabic",
              size: 24,
              bold: true,
              rightToLeft: true,
            }),
          ],
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    if (classified.type === "character-dialogue") {
      // اسم الشخصية bold + الحوار عادي
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${classified.character} : `,
              font: "Simplified Arabic",
              size: 24,
              bold: true,
              rightToLeft: true,
            }),
            new TextRun({
              text: classified.dialogue,
              font: "Simplified Arabic",
              size: 24,
              rightToLeft: true,
            }),
          ],
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
        })
      );
      continue;
    }

    if (classified.type === "action-cue") {
      // أكشن — بشرطة في الأول + خط مائل
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `- ${classified.text}`,
              font: "Simplified Arabic",
              size: 24,
              italics: true,
              rightToLeft: true,
            }),
          ],
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
        })
      );
      continue;
    }

    // narrative / fallback
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: classified.text,
            font: "Simplified Arabic",
            size: 24,
            rightToLeft: true,
          }),
        ],
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
      })
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
          },
        },
        children: paragraphs,
      },
    ],
  });
};

// ─── الدالة الرئيسية ──────────────────────────────────────────

/**
 * يحفظ النص المُراجع كملفي DOCX (خام + مُنسّق).
 *
 * @param {string} text - النص النهائي بعد vision-proofread
 * @param {string} originalFilename - اسم ملف PDF الأصلي
 * @returns {Promise<{rawPath: string, formattedPath: string}>}
 */
export const saveProofreadscene_header_3ocx = async (
  text,
  originalFilename
) => {
  if (!text || !text.trim()) {
    logger.warn("proofread-docx-skip: empty text");
    return { rawPath: "", formattedPath: "" };
  }

  const baseName =
    basename(originalFilename || "document.pdf", ".pdf")
      .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "document";

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rawFileName = `${baseName}-${timestamp}-raw.docx`;
  const formattedFileName = `${baseName}-${timestamp}-formatted.docx`;

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const rawDoc = buildRawDocx(text, originalFilename);
    const formattedDoc = buildFormattedDocx(text, originalFilename);

    const rawBuffer = await Packer.toBuffer(rawDoc);
    const formattedBuffer = await Packer.toBuffer(formattedDoc);

    const rawPath = join(OUTPUT_DIR, rawFileName);
    const formattedPath = join(OUTPUT_DIR, formattedFileName);

    await writeFile(rawPath, rawBuffer);
    await writeFile(formattedPath, formattedBuffer);

    logger.info(
      {
        rawPath,
        formattedPath,
        rawSize: rawBuffer.length,
        formattedSize: formattedBuffer.length,
        textLength: text.length,
      },
      "proofread-docx-saved"
    );

    return { rawPath, formattedPath };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        baseName,
      },
      "proofread-docx-failed"
    );
    return { rawPath: "", formattedPath: "" };
  }
};
