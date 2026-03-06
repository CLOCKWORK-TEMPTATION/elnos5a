/**
 * @module utils/file-import/open-pipeline
 * @description يبني إجراء فتح الملف النهائي ({@link FileOpenPipelineAction})
 * من نتيجة الاستخراج. يُرجع اتحاداً مميَّزاً (discriminated union) بثلاثة أنواع:
 *
 * - `import-structured-blocks` — كتل بنيوية جاهزة للإدراج المباشر
 * - `import-classified-text` — نص خام يحتاج تصنيف اللصق
 * - `reject` — ملف فارغ أو غير صالح
 *
 * يتضمن بناء بيانات القياس (telemetry) ورسائل التنبيه بالعربية.
 */
import type {
  FileExtractionResult,
  FileImportMode,
} from "../../types/file-import";
import type { ScreenplayBlock } from "./document-model";

type SuccessVariant = "default";
type ErrorVariant = "destructive";

type FileOpenToast = {
  title: string;
  description: string;
  variant?: SuccessVariant | ErrorVariant;
};

type FileOpenPipelineTelemetry = {
  openPipeline: "paste-classifier" | "structured-direct";
  method: FileExtractionResult["method"];
  source: "structured-blocks" | "extracted-text";
  usedOcr: boolean;
  qualityScore?: number;
  warnings: string[];
  preprocessedSteps: string[];
};

type ImportClassifiedAction = {
  kind: "import-classified-text";
  mode: FileImportMode;
  text: string;
  toast: FileOpenToast;
  telemetry: FileOpenPipelineTelemetry;
};

type ImportStructuredAction = {
  kind: "import-structured-blocks";
  mode: FileImportMode;
  blocks: ScreenplayBlock[];
  toast: FileOpenToast;
  telemetry: FileOpenPipelineTelemetry;
};

type RejectAction = {
  kind: "reject";
  mode: FileImportMode;
  toast: FileOpenToast & { variant: ErrorVariant };
  telemetry: FileOpenPipelineTelemetry;
};

/**
 * الاتحاد المميَّز لإجراءات فتح الملف.
 * كل متغير يحتوي `kind` و `mode` و `toast` و `telemetry`.
 */
export type FileOpenPipelineAction =
  | ImportStructuredAction
  | ImportClassifiedAction
  | RejectAction;

const FORCE_PASTE_CLASSIFIER_FILE_TYPES = new Set<
  FileExtractionResult["fileType"]
>(["doc", "docx"]);

/** يُرجع تسمية الوضع بالعربية: "تم فتح" أو "تم إدراج" */
const buildModeLabel = (mode: FileImportMode): string =>
  mode === "replace" ? "تم فتح" : "تم إدراج";

/** يبني كائن بيانات القياس من نتيجة الاستخراج */
const buildTelemetry = (
  extraction: FileExtractionResult,
  source: FileOpenPipelineTelemetry["source"],
  openPipeline: FileOpenPipelineTelemetry["openPipeline"]
): FileOpenPipelineTelemetry => ({
  openPipeline,
  method: extraction.method,
  source,
  usedOcr: extraction.usedOcr,
  qualityScore: extraction.qualityScore,
  warnings: extraction.warnings,
  preprocessedSteps: extraction.normalizationApplied ?? [],
});

/**
 * يبني الإجراء النهائي لخط أنابيب فتح الملف.
 *
 * - إذا وُجدت كتل بنيوية → `import-structured-blocks`
 *   (باستثناء `doc` و `docx` حيث يُفرض مسار `paste-classifier`)
 * - إذا وُجد نص فقط → `import-classified-text`
 * - إذا كان الملف فارغاً → `reject`
 *
 * @param extraction - نتيجة الاستخراج من {@link extractImportedFile}
 * @param mode - وضع الاستيراد (`replace` أو `insert`)
 * @returns الإجراء النهائي مع رسالة التنبيه وبيانات القياس
 */
export function buildFileOpenPipelineAction(
  extraction: FileExtractionResult,
  mode: FileImportMode
): FileOpenPipelineAction {
  const modeLabel = buildModeLabel(mode);

  const normalizedBlocks = (extraction.structuredBlocks ?? [])
    .map((block) => ({
      ...block,
      text: (block.text || "").trim(),
    }))
    .filter((block) => block.text.length > 0);

  const forcePasteClassifier = FORCE_PASTE_CLASSIFIER_FILE_TYPES.has(
    extraction.fileType
  );

  if (normalizedBlocks.length > 0 && !forcePasteClassifier) {
    let description = `${modeLabel} الملف بنجاح\nتم تمرير التنسيق البنيوي عبر مسار التصنيف والمراجعة`;
    if (extraction.usedOcr) {
      description += " (تم استخدام OCR)";
    }
    if (extraction.method === "app-payload") {
      description += "\n(تم استرجاع بنية Filmlane 1:1)";
    }
    if (extraction.warnings.length > 0) {
      description += `\n⚠️ ${extraction.warnings[0]}`;
    }

    return {
      kind: "import-structured-blocks",
      mode,
      toast: {
        title: modeLabel,
        description,
      },
      blocks: normalizedBlocks,
      telemetry: buildTelemetry(
        extraction,
        "structured-blocks",
        "paste-classifier"
      ),
    };
  }

  const sourceText = extraction.text ?? "";
  if (!sourceText.trim()) {
    return {
      kind: "reject",
      mode,
      toast: {
        title: "ملف فارغ",
        description: "لم يتم العثور على نص في الملف المحدد.",
        variant: "destructive",
      },
      telemetry: buildTelemetry(
        extraction,
        "extracted-text",
        "paste-classifier"
      ),
    };
  }

  let description = `${modeLabel} الملف بنجاح\nتم تطبيق تصنيف اللصق`;
  if (extraction.usedOcr) {
    description += " (تم استخدام OCR)";
  }
  if (extraction.method === "app-payload") {
    if (forcePasteClassifier) {
      description += "\n(تم فرض مسار اللصق الموحّد لهذا النوع من الملفات)";
    } else {
      description += "\n(لم تتوفر كتل بنيوية قابلة للاسترجاع المباشر)";
    }
  }
  if (extraction.warnings.length > 0) {
    description += `\n⚠️ ${extraction.warnings[0]}`;
  }

  return {
    kind: "import-classified-text",
    mode,
    text: sourceText,
    toast: {
      title: modeLabel,
      description,
    },
    telemetry: buildTelemetry(extraction, "extracted-text", "paste-classifier"),
  };
}
