import {
  htmlToScreenplayBlocks,
  type ScreenplayBlock,
} from "../file-import/document-model";

export interface ExportRequest {
  html: string;
  fileNameBase?: string;
  title?: string;
}

export interface BlockExportRequest {
  html: string;
  fileNameBase?: string;
  blocks?: ScreenplayBlock[];
}

export type DocxParagraphPreset = {
  alignment: "right" | "center" | "left" | "justify";
  bold?: boolean;
  italics?: boolean;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentStartTwip?: number;
  indentEndTwip?: number;
};

const DEFAULT_EXPORT_FILE_BASE = "screenplay";

export const downloadBlob = (fileName: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const sanitizeExportFileBaseName = (fileNameBase?: string): string => {
  const candidate = (fileNameBase ?? DEFAULT_EXPORT_FILE_BASE).trim();
  const normalized = candidate
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
  return normalized || DEFAULT_EXPORT_FILE_BASE;
};

export const pointsToTwips = (value: number): number =>
  Math.max(0, Math.round(value * 20));

export const normalizeText = (value: string): string =>
  (value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .trim();

export const resolveBlocksForExport = (
  content: string,
  blocks?: ScreenplayBlock[]
): ScreenplayBlock[] => {
  if (Array.isArray(blocks) && blocks.length > 0) {
    return blocks;
  }
  return htmlToScreenplayBlocks(content);
};

/**
 * تنسيقات DOCX لكل عنصر سيناريو — مطابقة للمحرر.
 *
 * التغييرات عن النسخة القديمة:
 * - transition: CENTER (كان LEFT — غلط)
 * - scene_header_3: bold (كان ناقص)
 * - dialogue: CENTER مع indentation (يطابق المحرر 4.1in centered)
 */
export const getDocxPresetForFormat = (
  formatId: ScreenplayBlock["formatId"]
): DocxParagraphPreset => {
  switch (formatId) {
    case "basmala":
      return {
        alignment: "center",
        bold: true,
        spacingAfterPt: 10,
      };
    case "scene_header_1":
      return {
        alignment: "right",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 6,
      };
    case "scene_header_2":
      return {
        alignment: "left",
        bold: true,
        spacingAfterPt: 4,
      };
    case "scene_header_3":
      return {
        alignment: "center",
        bold: true,
        spacingAfterPt: 4,
      };
    case "scene_header_top_line":
      return {
        alignment: "right",
        bold: true,
        spacingAfterPt: 6,
      };
    case "character":
      return {
        alignment: "center",
        bold: true,
        spacingBeforePt: 8,
        spacingAfterPt: 2,
      };
    case "dialogue":
      return {
        alignment: "center",
        spacingAfterPt: 6,
        indentStartTwip: 960,
        indentEndTwip: 720,
      };
    case "parenthetical":
      return {
        alignment: "center",
        italics: true,
        spacingAfterPt: 4,
      };
    case "transition":
      return {
        alignment: "center",
        bold: true,
        spacingBeforePt: 6,
        spacingAfterPt: 6,
      };
    case "action":
      return {
        alignment: "justify",
        spacingAfterPt: 6,
      };
    default:
      return {
        alignment: "right",
        spacingAfterPt: 6,
      };
  }
};

/**
 * يبني HTML كامل بتنسيقات مطابقة للمحرر.
 *
 * التنسيق مبني على:
 * - editor-format-styles.ts (CSS variables)
 * - page.css (spacing rules)
 * - PDF المرجعي (الوصية_الاولى_مصنف.pdf)
 *
 * الخط: AzarMehrMonospaced-San (نفس المحرر)
 * scene_header_top_line: flex layout (header-1 يمين، header-2 شمال)
 * transition: center + bold
 * dialogue: centered، عرض محدود، مع padding
 * character: centered، bold
 */
export const buildFullHtmlDocument = (
  bodyHtml: string,
  title = "تصدير محرر السيناريو"
): string => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      margin: 0 auto;
      width: min(794px, 100%);
      padding: 28px;
      direction: rtl;
      text-align: right;
      font-family: 'AzarMehrMonospaced-San', 'Courier New', monospace;
      font-size: 12pt;
      line-height: 15pt;
      color: #000000;
      background: #ffffff;
    }

    [data-type] {
      white-space: pre-wrap;
      margin-bottom: 0;
    }

    /* ── البسملة ── */
    [data-type="basmala"] {
      text-align: center;
      font-weight: 700;
      margin-bottom: 12pt;
    }

    /* ── سطر عنوان المشهد (flex: header-1 يمين، header-2 شمال) ── */
    [data-type="scene_header_top_line"] {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      margin-top: 12pt;
      margin-bottom: 0;
    }

    /* ── عنوان المشهد 1 (رقم المشهد) ── */
    [data-type="scene_header_1"] {
      font-weight: 700;
      flex: 0 0 auto;
    }
    /* عندما يكون مستقل (خارج top-line) */
    div > [data-type="scene_header_1"] {
      text-align: right;
      margin-top: 12pt;
      margin-bottom: 0;
    }

    /* ── عنوان المشهد 2 (الزمن والمكان) ── */
    [data-type="scene_header_2"] {
      font-weight: 700;
      flex: 0 0 auto;
    }
    div > [data-type="scene_header_2"] {
      text-align: left;
      margin-bottom: 0;
    }

    /* ── عنوان المشهد 3 (المكان التفصيلي) ── */
    [data-type="scene_header_3"] {
      text-align: center;
      font-weight: 700;
      margin-bottom: 0;
    }

    /* ── الحدث/الفعل ── */
    [data-type="action"] {
      text-align: justify;
      text-align-last: right;
      margin-top: 12pt;
      margin-bottom: 0;
    }

    /* ── الشخصية ── */
    [data-type="character"] {
      text-align: center;
      font-weight: 700;
      width: 4.1in;
      margin: 8pt auto 2pt auto;
    }

    /* ── الحوار ── */
    [data-type="dialogue"] {
      text-align: center;
      width: 4.1in;
      margin: 0 auto;
      padding: 0.25em 1em 0 1.5em;
    }

    /* ── بين الأقواس ── */
    [data-type="parenthetical"] {
      text-align: center;
      font-style: italic;
      margin: 0 auto;
    }

    /* ── الانتقال ── */
    [data-type="transition"] {
      text-align: center;
      font-weight: 700;
      margin-top: 12pt;
      margin-bottom: 12pt;
    }

    /* ── قواعد التباعد السياقية (مثل المحرر) ── */
    [data-type="character"] + [data-type="dialogue"],
    [data-type="character"] + [data-type="parenthetical"] {
      margin-top: 0;
    }
    [data-type="parenthetical"] + [data-type="dialogue"] {
      margin-top: 0;
    }
    [data-type="scene_header_top_line"] + [data-type="scene_header_3"] {
      margin-top: 0;
    }
    [data-type="dialogue"] + [data-type="character"] {
      margin-top: 12pt;
    }
    [data-type="dialogue"] + [data-type="action"],
    [data-type="dialogue"] + [data-type="transition"] {
      margin-top: 12pt;
    }
    [data-type="transition"] + [data-type="scene_header_top_line"] {
      margin-top: 12pt;
    }
    [data-type="scene_header_3"] + [data-type="action"] {
      margin-top: 12pt;
    }

    /* ── حماية فصل الشخصية عن حوارها عند تقسيم الصفحات ── */
    [data-type="character"] {
      break-after: avoid;
    }
    [data-type="character"] + [data-type="dialogue"],
    [data-type="character"] + [data-type="parenthetical"] {
      break-before: avoid;
    }

    @media print {
      body { padding: 0; width: 100%; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
