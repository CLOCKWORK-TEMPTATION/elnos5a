import { XMLBuilder } from "fast-xml-parser";
import type { ScreenplayBlock } from "../file-import/document-model";
import {
  type BlockExportRequest,
  downloadBlob,
  normalizeText,
  resolveBlocksForExport,
  sanitizeExportFileBaseName,
} from "./shared";

type FdxParagraphType =
  | "Scene Heading"
  | "Action"
  | "Character"
  | "Dialogue"
  | "Parenthetical"
  | "Transition"
  | "General";

/**
 * تحويل formatId → FDX Paragraph Type.
 *
 * ملاحظة مهمة: FDX بيطبّق التنسيق تلقائيًا بناءً على Paragraph Type.
 * يعني Character هيبقى centered bold تلقائيًا في Final Draft.
 * لكن بنضيف Style attributes كمان للتوافق مع محررات تانية.
 */
const mapFormatIdToFdxType = (
  formatId: ScreenplayBlock["formatId"]
): FdxParagraphType => {
  switch (formatId) {
    case "scene_header_1":
    case "scene_header_2":
    case "scene_header_3":
    case "scene_header_top_line":
      return "Scene Heading";
    case "action":
      return "Action";
    case "character":
      return "Character";
    case "dialogue":
      return "Dialogue";
    case "parenthetical":
      return "Parenthetical";
    case "transition":
      return "Transition";
    case "basmala":
      return "General";
    default:
      return "Action";
  }
};

/**
 * تحديد FDX Text Style بناءً على formatId.
 * Final Draft يستخدم: Bold, Italic, Underline, Bold+Italic, إلخ
 */
const getFdxTextStyle = (formatId: ScreenplayBlock["formatId"]): string => {
  switch (formatId) {
    case "basmala":
    case "scene_header_1":
    case "scene_header_2":
    case "scene_header_3":
    case "scene_header_top_line":
    case "character":
    case "transition":
      return "Bold";
    case "parenthetical":
      return "Italic";
    default:
      return "";
  }
};

interface FdxParagraph {
  "@_Type": FdxParagraphType;
  Text:
    | { "#text": string; "@_Style"?: string }
    | { "#text": string; "@_Style"?: string }[];
  SceneProperties?: { "@_Title": string };
}

/**
 * يبني مصفوفة فقرات FDX من كتل السيناريو.
 *
 * قواعد الدمج:
 * - scene_header_1 + scene_header_2 المتتاليين → Scene Heading واحد (مشهد1 - نهار - داخلي)
 * - basmala → General مع Style="Bold"
 * - parenthetical → نص محاط بأقواس
 * - شخصية بعدها حوار دائمًا (لا يتغير ترتيب FDX)
 */
const buildFdxParagraphs = (blocks: ScreenplayBlock[]): FdxParagraph[] => {
  const paragraphs: FdxParagraph[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = normalizeText(block.text);
    if (!text) continue;

    // scene_header_top_line: wrapper فقط — نتخطاه
    if (block.formatId === "scene_header_top_line") {
      continue;
    }

    // دمج scene_header_1 + scene_header_2 المتتاليين
    if (block.formatId === "scene_header_1") {
      const next = blocks[i + 1];
      let combinedText = text;
      if (next && next.formatId === "scene_header_2") {
        const nextText = normalizeText(next.text);
        if (nextText) {
          combinedText = `${text} - ${nextText}`;
        }
        i += 1;
      }
      // لو في scene_header_3 بعدهم — نضيفه كفقرة منفصلة
      const afterNext = blocks[i + 1];
      if (afterNext && afterNext.formatId === "scene_header_3") {
        const h3Text = normalizeText(afterNext.text);
        if (h3Text) {
          combinedText = `${combinedText}\n${h3Text}`;
        }
        i += 1;
      }
      paragraphs.push({
        "@_Type": "Scene Heading",
        Text: { "#text": combinedText, "@_Style": "Bold" },
        SceneProperties: { "@_Title": combinedText },
      });
      continue;
    }

    // scene_header_2 أو scene_header_3 مستقلين (نادر)
    if (
      block.formatId === "scene_header_2" ||
      block.formatId === "scene_header_3"
    ) {
      paragraphs.push({
        "@_Type": "Scene Heading",
        Text: { "#text": text, "@_Style": "Bold" },
      });
      continue;
    }

    const style = getFdxTextStyle(block.formatId);
    paragraphs.push({
      "@_Type": mapFormatIdToFdxType(block.formatId),
      Text: style ? { "#text": text, "@_Style": style } : { "#text": text },
    });
  }

  return paragraphs;
};

export const exportAsFdx = (request: BlockExportRequest): void => {
  const blocks = resolveBlocksForExport(request.html, request.blocks);
  const fileBase = sanitizeExportFileBaseName(request.fileNameBase);

  const paragraphs = buildFdxParagraphs(blocks);

  // استخراج أسماء الشخصيات للـ SmartType
  const characterNames = [
    ...new Set(
      blocks
        .filter((b) => b.formatId === "character")
        .map((b) => normalizeText(b.text))
        .filter(Boolean)
    ),
  ];

  const fdxDocument = {
    FinalDraft: {
      "@_DocumentType": "Script",
      "@_Template": "No",
      "@_Version": "5",
      Content: {
        Paragraph: paragraphs,
      },
      SmartType: {
        Characters: {
          Character: characterNames.map((name) => ({ "@_Name": name })),
        },
        Extensions: {
          Extension: ["(V.O.)", "(O.S.)", "(CONT'D)"],
        },
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: false,
    processEntities: true,
  });

  const xmlBody = builder.build(fdxDocument);
  const xmlString = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n${xmlBody}`;

  const blob = new Blob([xmlString], {
    type: "application/xml;charset=utf-8",
  });
  downloadBlob(`${fileBase}.fdx`, blob);
};
