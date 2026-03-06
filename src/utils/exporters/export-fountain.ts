import type { ScreenplayBlock } from "../file-import/document-model";
import {
  type BlockExportRequest,
  downloadBlob,
  normalizeText,
  resolveBlocksForExport,
  sanitizeExportFileBaseName,
} from "./shared";

/**
 * يبني نص Fountain من كتل السيناريو.
 *
 * قواعد Fountain للعربي:
 * - `@` prefix لأسماء الشخصيات (العربية ليس فيها UPPERCASE)
 * - `.` prefix لعناوين المشاهد (لا تبدأ بـ INT./EXT.)
 * - `> text <` للنص المركزي (بسملة، انتقال)
 * - بين الأقواس: (نص) بين شخصية وحوار
 *
 * قواعد الترتيب:
 * - شخصية → حوار (أو بين أقواس → حوار)
 * - حوار → شخصية أو أكشن أو انتقال (مش حوار تاني إلا لو نفس الشخصية)
 */
const buildFountainString = (blocks: ScreenplayBlock[]): string => {
  const lines: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = normalizeText(block.text);
    if (!text) continue;

    switch (block.formatId) {
      case "basmala":
        lines.push("", `> ${text} <`, "");
        break;

      case "scene_header_top_line":
        // wrapper فقط — نتخطاه
        break;

      case "scene_header_1": {
        // دمج scene_header_1 + scene_header_2 المتتاليين
        const next = blocks[i + 1];
        let heading = text;
        if (next && next.formatId === "scene_header_2") {
          const nextText = normalizeText(next.text);
          if (nextText) {
            heading = `${text} - ${nextText}`;
          }
          i += 1;
        }
        // لو في scene_header_3 بعدهم
        const afterNext = blocks[i + 1];
        if (afterNext && afterNext.formatId === "scene_header_3") {
          const h3Text = normalizeText(afterNext.text);
          if (h3Text) {
            heading = `${heading}\n${h3Text}`;
          }
          i += 1;
        }
        lines.push("", `.${heading}`, "");
        break;
      }

      case "scene_header_2":
      case "scene_header_3":
        lines.push("", `.${text}`, "");
        break;

      case "action":
        lines.push("", text, "");
        break;

      case "character":
        lines.push("", `@${text}`);
        break;

      case "dialogue":
        lines.push(text, "");
        break;

      case "parenthetical": {
        const cleaned = text.replace(/^\(|\)$/g, "");
        lines.push(`(${cleaned})`);
        break;
      }

      case "transition":
        lines.push("", `> ${text} <`, "");
        break;

      default:
        lines.push("", text, "");
        break;
    }
  }

  // تنظيف الأسطر الفارغة المتتالية (3+ → 2)
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
};

export const exportAsFountain = (request: BlockExportRequest): void => {
  const blocks = resolveBlocksForExport(request.html, request.blocks);
  const fileBase = sanitizeExportFileBaseName(request.fileNameBase);

  const fountainText = buildFountainString(blocks);

  const blob = new Blob([fountainText], {
    type: "text/plain;charset=utf-8",
  });
  downloadBlob(`${fileBase}.fountain`, blob);
};
