/**
 * @module controllers/editor-actions-controller
 * @description متحكم أوامر القوائم وعمليات الملفات والتصدير.
 *   مستخرج من `App.tsx` لتطبيق مبدأ المسؤولية الواحدة.
 */
import type { EditorArea, FileImportMode } from "../components/editor";
import type { MenuToastPayload } from "./insert-menu-controller";
import {
  FORMAT_CYCLE_ORDER,
  FORMAT_LABEL_BY_TYPE,
  LIBRARY_ACTION_BY_ITEM,
  PROJECT_TEMPLATE_BY_NAME,
  ensureDocxFilename,
  formatPdfOcrIssueDescription,
} from "../constants/format-mappings";
import type { MenuActionId, ExportFormat } from "../constants/menu-definitions";
import {
  ACCEPTED_FILE_EXTENSIONS,
  getFileType,
  type EditorEngineAdapter,
  type RunDocumentThroughPasteWorkflowOptions,
  type TypingSystemSettings,
} from "../types";
import {
  buildFileOpenPipelineAction,
  extractImportedFile,
  fetchUnifiedTextExtract,
  probeBackendPdfOcrReadiness,
  pickImportFile,
} from "../utils/file-import";
import { logger } from "../utils/logger";
import { loadFromStorage } from "../hooks";
import { pipelineRecorder } from "../extensions/pipeline-recorder";

interface EditorAutosaveSnapshot {
  text: string;
  updatedAt: string;
}

const AUTOSAVE_DRAFT_STORAGE_KEY = "filmlane.autosave.document-text.v1";

export interface EditorActionsDeps {
  getArea: () => EditorArea | null;
  toast: (payload: MenuToastPayload) => void;
  resolveMenuCommand: (actionId: string) => boolean;
  runDocumentThroughPasteWorkflow: (
    options: RunDocumentThroughPasteWorkflowOptions
  ) => Promise<void>;
  runForcedProductionSelfCheck: (
    trigger: "manual-auto-check" | "manual-reclassify"
  ) => Promise<void>;
  typingSystemSettings: TypingSystemSettings;
}

export const openFile = async (
  mode: FileImportMode,
  deps: Pick<EditorActionsDeps, "getArea" | "toast">
): Promise<void> => {
  const area = deps.getArea();
  if (!area) return;

  const file = await pickImportFile(ACCEPTED_FILE_EXTENSIONS);
  if (!file) return;

  try {
    logger.info("File import pipeline started", {
      scope: "file-import",
      data: {
        filename: file.name,
        mode,
        strategy: "backend-only-strict",
        pipeline: "frontend-open->backend-extract->editor-apply",
      },
    });

    const detectedFileType = getFileType(file.name);
    if (detectedFileType === "pdf") {
      const readiness = await probeBackendPdfOcrReadiness();
      if (!readiness.ready) {
        const readinessMessage = formatPdfOcrIssueDescription(
          readiness.errorCode,
          readiness.errorMessage
        );

        deps.toast({
          title: mode === "replace" ? "تعذر فتح الملف" : "تعذر إدراج الملف",
          description: readinessMessage,
          variant: "destructive",
        });

        logger.warn("PDF import blocked by OCR readiness", {
          scope: "file-import",
          data: {
            filename: file.name,
            mode,
            readiness,
          },
        });
        return;
      }
    }

    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    const extractStart = performance.now();
    pipelineRecorder.logFileOpen(
      file.name,
      detectedFileType ?? "unknown",
      mode
    );
    const extraction = await extractImportedFile(file, {
      backend: { timeoutMs: isPdf ? 10 * 60 * 1_000 : 45_000 },
    });
    pipelineRecorder.logFileExtractDone({
      fileName: file.name,
      method: extraction.method,
      usedOcr: extraction.usedOcr,
      textLength: extraction.text.length,
      schemaElementCount: extraction.schemaElements?.length ?? 0,
      latencyMs: Math.round(performance.now() - extractStart),
    });

    // T016-T018 (FR-005, FR-006): DOC files must go through unified
    // /api/text-extract before classification. The unified response
    // provides schema elements as hints for the local classifier.
    // FR-006: failure is explicit — no silent fallback.
    const isDocFile = detectedFileType === "doc";
    if (isDocFile && extraction.text.trim()) {
      logger.info(
        "DOC unified pipeline: sending extracted text to /api/text-extract",
        {
          scope: "file-import",
          data: {
            filename: file.name,
            textLength: extraction.text.length,
          },
        }
      );

      const unifiedResult = await fetchUnifiedTextExtract(
        extraction.text,
        "doc"
      );

      extraction.schemaElements = unifiedResult.schemaElements;

      pipelineRecorder.logBridgeCall(
        "doc",
        unifiedResult.schemaElements.length,
        unifiedResult.processingTimeMs
      );

      logger.info("DOC unified pipeline: received unified response", {
        scope: "file-import",
        data: {
          schemaElementCount: unifiedResult.schemaElements.length,
          processingTimeMs: unifiedResult.processingTimeMs,
        },
      });
    }

    const action = buildFileOpenPipelineAction(extraction, mode);
    let appliedPipeline = "paste-classifier" as const;

    if (action.kind === "reject") {
      deps.toast(action.toast);
      return;
    }

    if (action.kind === "import-structured-blocks") {
      await area.importStructuredBlocks(action.blocks, mode);
    } else {
      await area.importClassifiedText(action.text, mode, {
        sourceFileType: extraction.fileType,
        sourceMethod: extraction.method,
        classificationProfile: "generic-open",
        schemaElements: extraction.schemaElements,
      });
      appliedPipeline = "paste-classifier";
    }

    deps.toast({
      ...action.toast,
    });

    logger.info("File import pipeline completed", {
      scope: "file-import",
      data: {
        ...action.telemetry,
        appliedPipeline,
      },
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "حدث خطأ غير معروف أثناء فتح الملف.";
    const extractionErrorCode =
      typeof (error as { errorCode?: unknown })?.errorCode === "string"
        ? ((error as { errorCode?: string }).errorCode ?? "").trim()
        : "";

    const normalizedMessage = extractionErrorCode
      ? formatPdfOcrIssueDescription(extractionErrorCode, rawMessage)
      : rawMessage;

    const backendRelatedFailure =
      /failed to fetch|backend|connection|timed out|err_connection_refused|vite_file_import_backend_url/i.test(
        normalizedMessage
      );
    const message = backendRelatedFailure
      ? `${normalizedMessage}\nفي التطوير المحلي: استخدم pnpm dev (يشغّل backend تلقائيًا).`
      : normalizedMessage;
    deps.toast({
      title: mode === "replace" ? "تعذر فتح الملف" : "تعذر إدراج الملف",
      description: message,
      variant: "destructive",
    });
    logger.error("File import pipeline failed", {
      scope: "file-import",
      data: error,
    });
  }
};

export const runExport = async (
  format: ExportFormat,
  deps: Pick<EditorActionsDeps, "getArea" | "toast">,
  fileBase?: string
): Promise<void> => {
  const area = deps.getArea();
  if (!area) return;

  const html = area.getAllHtml().trim();
  if (!html) {
    deps.toast({
      title: "لا يوجد محتوى",
      description: "اكتب شيئًا أولًا قبل الحفظ.",
      variant: "destructive",
    });
    return;
  }

  try {
    const blocks = area.getBlocks();

    const labelByFormat: Record<ExportFormat, string> = {
      docx: "DOCX",
      html: "HTML",
      pdf: "PDF",
      pdfa: "PDF/A",
      fdx: "FDX",
      fountain: "Fountain",
      classified: "النص المصنف",
    };

    if (format === "docx") {
      const { exportToDocx } = await import("../utils/exporters");
      const resolvedFileName = ensureDocxFilename(
        fileBase ?? "screenplay.docx"
      );
      await exportToDocx(html, resolvedFileName, { blocks });
      deps.toast({
        title: "تم التصدير",
        description: "تم حفظ الملف بصيغة DOCX.",
      });
      return;
    }

    if (format === "fdx") {
      const { exportAsFdx } = await import("../utils/exporters");
      exportAsFdx({ html, fileNameBase: fileBase, blocks });
      deps.toast({
        title: "تم التصدير",
        description: `تم تصدير الملف بصيغة ${labelByFormat[format]}.`,
      });
      return;
    }

    if (format === "fountain") {
      const { exportAsFountain } = await import("../utils/exporters");
      exportAsFountain({ html, fileNameBase: fileBase, blocks });
      deps.toast({
        title: "تم التصدير",
        description: `تم تصدير الملف بصيغة ${labelByFormat[format]}.`,
      });
      return;
    }

    if (format === "pdfa") {
      const { exportAsPdfA } = await import("../utils/exporters");
      await exportAsPdfA({
        html,
        fileNameBase: fileBase,
        title: "تصدير محرر السيناريو",
      });
      deps.toast({
        title: "تم التصدير",
        description: `تم تصدير الملف بصيغة ${labelByFormat[format]}.`,
      });
      return;
    }

    if (format === "classified") {
      const { exportAsClassified } = await import("../utils/exporters");
      exportAsClassified({ fileNameBase: fileBase, blocks });
      deps.toast({
        title: "تم اعتماد النص",
        description: "تم تصدير الملف كملف نصي مصنف (TXT).",
      });
      return;
    }

    if (format === "html") {
      const { exportAsHtml } = await import("../utils/exporters");
      exportAsHtml({
        html,
        fileNameBase: fileBase,
        title: "تصدير محرر السيناريو",
      });
    } else {
      const { exportAsPdf } = await import("../utils/exporters");
      await exportAsPdf({
        html,
        fileNameBase: fileBase,
        title: "تصدير محرر السيناريو",
      });
    }

    deps.toast({
      title: "تم التصدير",
      description: `تم تصدير الملف بصيغة ${labelByFormat[format]}.`,
    });
  } catch (error) {
    deps.toast({
      title: "تعذر التصدير",
      description:
        error instanceof Error
          ? error.message
          : "حدث خطأ غير معروف أثناء التصدير.",
      variant: "destructive",
    });
    logger.error("Document export failed", {
      scope: "export",
      data: { format, error },
    });
  }
};

export const handleMenuAction = async (
  actionId: MenuActionId,
  deps: EditorActionsDeps
): Promise<void> => {
  const area = deps.getArea();
  if (!area) return;
  const engine = area as unknown as EditorEngineAdapter;

  if (deps.resolveMenuCommand(actionId)) {
    return;
  }

  switch (actionId) {
    case "new-file":
      area.clear();
      deps.toast({ title: "مستند جديد", description: "تم إنشاء مستند فارغ." });
      break;
    case "open-file":
      await openFile("replace", deps);
      break;
    case "insert-file":
      await openFile("insert", deps);
      break;
    case "save-file":
      await runExport("docx", deps, "screenplay.docx");
      break;
    case "print-file":
      window.print();
      break;
    case "export-html":
      await runExport("html", deps, "screenplay-export");
      break;
    case "export-pdf":
      await runExport("pdf", deps, "screenplay-export");
      break;
    case "export-pdfa":
      await runExport("pdfa", deps, "screenplay-export");
      break;
    case "export-fdx":
      await runExport("fdx", deps, "screenplay-export");
      break;
    case "export-fountain":
      await runExport("fountain", deps, "screenplay-export");
      break;
    case "export-classified":
      await runExport("classified", deps, "النص_المصنف");
      break;
    case "undo":
    case "redo":
      engine.runCommand({ command: actionId });
      break;
    case "bold":
    case "italic":
    case "underline":
    case "align-right":
    case "align-center":
    case "align-left":
      area.runCommand(actionId);
      break;
    case "quick-cycle-format": {
      const current = area.getCurrentFormat();
      const currentIndex = current ? FORMAT_CYCLE_ORDER.indexOf(current) : -1;
      const nextFormat =
        currentIndex >= 0
          ? FORMAT_CYCLE_ORDER[(currentIndex + 1) % FORMAT_CYCLE_ORDER.length]
          : FORMAT_CYCLE_ORDER[0];

      area.setFormat(nextFormat);
      deps.toast({
        title: "تبديل التنسيق",
        description: `تم التحويل إلى: ${FORMAT_LABEL_BY_TYPE[nextFormat]}`,
      });
      break;
    }
    case "show-draft-info": {
      const snapshot = loadFromStorage<EditorAutosaveSnapshot | null>(
        AUTOSAVE_DRAFT_STORAGE_KEY,
        null
      );
      if (!snapshot?.updatedAt) {
        deps.toast({
          title: "معلومات المسودة",
          description: "لا توجد مسودة محفوظة تلقائيًا حتى الآن.",
        });
        break;
      }

      const updatedAtLabel = new Date(snapshot.updatedAt).toLocaleString(
        "ar-EG"
      );
      deps.toast({
        title: "معلومات المسودة",
        description: `آخر حفظ تلقائي: ${updatedAtLabel}`,
      });
      break;
    }
    case "copy":
      if (!(await engine.copySelectionToClipboard())) {
        document.execCommand("copy");
      }
      break;
    case "cut":
      if (!(await engine.cutSelectionToClipboard())) {
        document.execCommand("cut");
      }
      break;
    case "paste": {
      try {
        const pasted = await engine.pasteFromClipboard("menu");
        if (pasted) {
          deps.toast({
            title: "تم اللصق",
            description: "تم تمرير النص عبر المصنف وإدراجه.",
          });
          if (deps.typingSystemSettings.typingSystemMode === "auto-deferred") {
            void deps.runDocumentThroughPasteWorkflow({
              source: "manual-deferred",
              reviewProfile: "interactive",
              policyProfile: "interactive-legacy",
            });
          }
          break;
        }
        document.execCommand("paste");
      } catch {
        document.execCommand("paste");
      }
      break;
    }
    case "select-all":
      engine.runCommand({ command: "select-all" });
      break;
    case "about":
      deps.toast({
        title: "أفان تيتر",
        description: "واجهة Aceternity + محرك تصنيف Tiptap مفعلين معًا.",
      });
      break;
    case "help-shortcuts":
      deps.toast({
        title: "اختصارات سريعة",
        description:
          "Ctrl+S حفظ، Ctrl+O فتح، Ctrl+N مستند جديد، Ctrl+Z تراجع، Ctrl+Y إعادة، Ctrl+B/I/U تنسيق.",
      });
      break;
    case "tool-auto-check":
      await deps.runDocumentThroughPasteWorkflow({
        source: "manual-deferred",
        reviewProfile: "interactive",
        policyProfile: "strict-structure",
      });
      await deps.runForcedProductionSelfCheck("manual-auto-check");
      break;
    case "tool-reclassify":
      await deps.runDocumentThroughPasteWorkflow({
        source: "manual-deferred",
        reviewProfile: "interactive",
        policyProfile: "interactive-legacy",
      });
      await deps.runForcedProductionSelfCheck("manual-reclassify");
      break;
    default:
      break;
  }
};

export const handleSidebarItemAction = async (
  sectionId: string,
  itemLabel: string,
  deps: EditorActionsDeps
): Promise<void> => {
  const area = deps.getArea();
  if (!area) return;

  if (sectionId === "docs") {
    const mode: FileImportMode = itemLabel.endsWith(".txt")
      ? "insert"
      : "replace";
    deps.toast({
      title: "اختر الملف",
      description: `سيتم ${mode === "replace" ? "فتح" : "إدراج"} "${itemLabel}" بعد اختياره من جهازك.`,
    });
    await openFile(mode, deps);
    return;
  }

  if (sectionId === "projects") {
    const template =
      PROJECT_TEMPLATE_BY_NAME[
        itemLabel as keyof typeof PROJECT_TEMPLATE_BY_NAME
      ];
    if (!template) {
      deps.toast({
        title: "المشروع غير متاح",
        description: `لا يوجد قالب جاهز للمشروع "${itemLabel}".`,
        variant: "destructive",
      });
      return;
    }

    const html = `
      <div data-type="scene_header_top_line"><div data-type="scene_header_1">${template.sceneHeader1}</div><div data-type="scene_header_2">${template.sceneHeader2}</div></div>
      <div data-type="scene_header_3">${template.sceneHeader3}</div>
      <div data-type="action">${template.action}</div>
    `.trim();

    area.editor.commands.setContent(html);
    area.editor.commands.focus("end");
    deps.toast({
      title: "تم تحميل المشروع",
      description: `تم فتح قالب "${itemLabel}" داخل المحرر.`,
    });
    return;
  }

  if (sectionId === "library") {
    const actionId =
      LIBRARY_ACTION_BY_ITEM[itemLabel as keyof typeof LIBRARY_ACTION_BY_ITEM];
    if (actionId) {
      await handleMenuAction(actionId, deps);
      return;
    }
  }

  deps.toast({
    title: "إجراء غير معرف",
    description: `لا يوجد إجراء مرتبط بالعنصر "${itemLabel}" حالياً.`,
    variant: "destructive",
  });
};
