import { createScreenplayEditor, SCREENPLAY_ELEMENTS } from "../../editor";
import {
  applyPasteClassifierFlowToView,
  PASTE_CLASSIFIER_ERROR_EVENT,
} from "../../extensions/paste-classifier";
import {
  isElementType,
  type ElementType,
} from "../../extensions/classification-types";
import {
  htmlToScreenplayBlocks,
  type ScreenplayBlock,
} from "../../utils/file-import";
import { maybeReconstructUnstructured } from "../../pipeline/unstructured";
import { type ClipboardOrigin } from "../../types/editor-clipboard";
import type { RunEditorCommandOptions } from "../../types/editor-engine";
import type {
  DocumentStats,
  EditorAreaProps,
  EditorCommand,
  EditorHandle,
  FileImportMode,
  ImportClassificationContext,
} from "./editor-area.types";
import { logger } from "../../utils/logger";
import {
  copyToClipboard,
  cutToClipboard,
  pasteFromClipboard,
} from "../../utils/editor-clipboard";
import { CharacterWidowFixer } from "../../utils/character-widow-fix";
import {
  applyLayoutMetrics,
  applyEditorTypography,
} from "../../utils/editor-layout";
import { EditorPageModel } from "../../utils/editor-page-model";

const commandNameByFormat: Record<ElementType, string> = {
  action: "setAction",
  dialogue: "setDialogue",
  character: "setCharacter",
  scene_header_1: "setSceneHeaderTopLine",
  scene_header_2: "setSceneHeaderTopLine",
  scene_header_3: "setSceneHeader3",
  scene_header_top_line: "setSceneHeaderTopLine",
  transition: "setTransition",
  parenthetical: "setParenthetical",
  basmala: "setBasmala",
};

const formatLabelByType: Record<ElementType, string> = {
  action: "حدث / وصف",
  dialogue: "حوار",
  character: "شخصية",
  scene_header_1: "رأس المشهد (1)",
  scene_header_2: "رأس المشهد (2)",
  scene_header_3: "رأس المشهد (3)",
  scene_header_top_line: "سطر رأس المشهد",
  transition: "انتقال",
  parenthetical: "تعليمات حوار",
  basmala: "بسملة",
};

/**
 * @description المكون الرئيسي لمنطقة تحرير السيناريو. يدير كائن Tiptap ومزامنة التنسيقات ويراقب تغييرات الصفحة (Layout).
 *
 * @complexity الزمنية: O(1) للتهيئة الأساسية | المكانية: O(n) استناداً لحجم المستند.
 *
 * @sideEffects
 *   - يتفاعل بشكل كثيف مع الـ DOM (تحديث أحجام، ومراقبة تغيرات).
 *   - قد يُنشأ ResizeObserver.
 *
 * @usedBy
 *   - `ScreenplayEditor` لربط منطقة الكتابة بالترويسة وأدوات أخرى.
 *
 * @example
 * ```typescript
 * const area = new EditorArea({ mount: div, onContentChange: (text) => console.log(text) });
 * area.getHandle().clear();
 * ```
 */
export class EditorArea implements EditorHandle {
  readonly editor;

  private readonly props: EditorAreaProps;
  private readonly body: HTMLDivElement;
  private readonly hasPagesExtension: boolean;
  private readonly characterWidowFixer = new CharacterWidowFixer();
  private readonly pageModel: EditorPageModel;
  private hasRequestedProductionSelfCheck = false;

  constructor(props: EditorAreaProps) {
    this.props = props;

    const sheet = document.createElement("div");
    sheet.className = "screenplay-sheet filmlane-sheet-paged";
    sheet.style.height = "auto";
    sheet.style.overflow = "hidden";
    sheet.style.minHeight = "var(--page-height)";

    const body = document.createElement("div");
    body.className = "screenplay-sheet__body";

    applyLayoutMetrics(sheet);
    applyEditorTypography(body);
    sheet.appendChild(body);

    props.mount.innerHTML = "";
    props.mount.appendChild(sheet);

    this.body = body;

    this.editor = createScreenplayEditor(body);
    this.hasPagesExtension = this.editor.extensionManager.extensions.some(
      (extension) => extension.name === "pages"
    );

    this.pageModel = new EditorPageModel(
      this.editor,
      this.body,
      this.hasPagesExtension,
      () => {
        this.scheduleCharacterWidowFix();
        this.emitState();
      }
    );

    this.editor.on("update", this.handleEditorUpdate);
    this.editor.on("selectionUpdate", this.handleSelectionUpdate);
    this.editor.on("transaction", this.handleSelectionUpdate);
    if (typeof window !== "undefined") {
      window.addEventListener(
        PASTE_CLASSIFIER_ERROR_EVENT,
        this.handlePasteClassifierError as EventListener
      );
    }

    this.pageModel.bindObservers();
    this.pageModel.refreshPageModel(true);
    this.emitState();

    // تسجيل أداة التشخيص في الـ console (TODO: شيلها بعد التجربة)
    void import("../../extensions/pipeline-diagnostics").then(
      ({ registerPipelineDiagnostics }) => {
        registerPipelineDiagnostics(() => this.getAllText());
      }
    );
  }

  getAllText = (): string => this.editor.getText();

  getAllHtml = (): string => this.editor.getHTML();

  focusEditor = (): void => {
    this.editor.commands.focus("end");
  };

  clear = (): void => {
    this.editor.commands.setContent('<div data-type="action"></div>');
    this.editor.commands.focus("start");
    this.pageModel.refreshPageModel(true);
    this.emitState();
  };

  runCommand = (
    commandInput: EditorCommand | RunEditorCommandOptions
  ): boolean => {
    const command =
      typeof commandInput === "string" ? commandInput : commandInput.command;

    switch (command) {
      case "bold":
        return this.editor.chain().focus().toggleBold().run();
      case "italic":
        return this.editor.chain().focus().toggleItalic().run();
      case "underline":
        return this.editor.chain().focus().toggleUnderline().run();
      case "align-right":
        return this.applyTextAlignCommand("right");
      case "align-center":
        return this.applyTextAlignCommand("center");
      case "align-left":
        return this.applyTextAlignCommand("left");
      case "undo": {
        const undo = (this.editor.commands as Record<string, unknown>).undo;
        return typeof undo === "function" ? (undo as () => boolean)() : false;
      }
      case "redo": {
        const redo = (this.editor.commands as Record<string, unknown>).redo;
        return typeof redo === "function" ? (redo as () => boolean)() : false;
      }
      case "select-all":
        this.editor.commands.selectAll();
        return true;
      case "focus-end":
        this.editor.commands.focus("end");
        return true;
      default:
        return false;
    }
  };

  private applyTextAlignCommand(
    alignment: "left" | "center" | "right"
  ): boolean {
    const chain = this.editor.chain().focus() as unknown as {
      setTextAlign?: (value: "left" | "center" | "right") => {
        run: () => boolean;
      };
      run: () => boolean;
    };

    if (typeof chain.setTextAlign === "function") {
      const result = chain.setTextAlign(alignment).run();
      if (result) return true;
    }

    const setTextAlign = (this.editor.commands as Record<string, unknown>)
      .setTextAlign;
    if (typeof setTextAlign === "function") {
      const result = (
        setTextAlign as (value: "left" | "center" | "right") => boolean
      )(alignment);
      if (result) return true;
    }

    return this.applyTextAlignDomFallback(alignment);
  }

  private applyTextAlignDomFallback(
    alignment: "left" | "center" | "right"
  ): boolean {
    const domSelection =
      typeof window !== "undefined" && typeof window.getSelection === "function"
        ? window.getSelection()
        : null;

    let targetElement: HTMLElement | null = null;
    const anchorNode = domSelection?.anchorNode ?? null;

    if (anchorNode) {
      const anchorElement =
        anchorNode instanceof HTMLElement
          ? anchorNode
          : anchorNode.parentElement;
      targetElement =
        anchorElement?.closest<HTMLElement>("[data-type]") ?? null;
    }

    if (!targetElement) {
      const fromPos = this.editor.state.selection.from;
      const nodeAtPos = this.editor.view.nodeDOM(fromPos);
      const baseElement =
        nodeAtPos instanceof HTMLElement
          ? nodeAtPos
          : (nodeAtPos?.parentElement ?? null);
      targetElement = baseElement?.closest<HTMLElement>("[data-type]") ?? null;
    }

    if (!targetElement) return false;

    targetElement.style.textAlign = alignment;
    if (targetElement.getAttribute("data-type") === "action") {
      if (alignment === "right") {
        targetElement.style.textAlignLast = "right";
        targetElement.style.setProperty("text-justify", "inter-word");
      } else {
        targetElement.style.textAlignLast = "auto";
        targetElement.style.setProperty("text-justify", "auto");
      }
    }

    return true;
  }

  setFormat = (format: ElementType): boolean => {
    const commandName = commandNameByFormat[format];
    const command = (this.editor.commands as Record<string, unknown>)[
      commandName
    ];
    if (typeof command !== "function") return false;
    return (command as () => boolean)();
  };

  getCurrentFormat = (): ElementType | null => {
    for (const item of SCREENPLAY_ELEMENTS) {
      if (!isElementType(item.name)) continue;
      if (this.editor.isActive(item.name)) return item.name;
    }
    return null;
  };

  getCurrentFormatLabel = (): string => {
    const format = this.getCurrentFormat();
    return format ? formatLabelByType[format] : "—";
  };

  importClassifiedText = async (
    text: string,
    mode: FileImportMode = "replace",
    context?: ImportClassificationContext
  ): Promise<void> => {
    // ضمان تفعيل دورة القياس في امتداد الصفحات قبل/بعد إدراج النص.
    this.editor.commands.focus(mode === "replace" ? "start" : "end");

    // الـ unstructured pipeline يتنادى بس لما النص فعلاً unstructured:
    // - مش paste عادي (classificationProfile !== "paste")
    // - مفيش structuredHints جاهزة من المصدر
    // - مش ملف doc/docx (اللي عنده بنية أصلاً)
    const skipUnstructured =
      context?.classificationProfile === "paste" ||
      (context?.structuredHints && context.structuredHints.length > 0) ||
      context?.sourceFileType === "doc" ||
      context?.sourceFileType === "docx";

    if (!skipUnstructured) {
      const unstructured = maybeReconstructUnstructured(text, {
        threshold: 0.7,
        replaceBullets: true,
      });

      if (unstructured.applied) {
        const existingHints = context?.structuredHints ?? [];
        const mergedHints = unstructured.structuredBlocks.concat(existingHints);

        text = unstructured.structuredText;
        context = {
          ...(context ?? {}),
          structuredHints: mergedHints,
        };
      }
    }

    const state = this.editor.view.state;
    const replaceAllFrom = 0;
    const replaceAllTo = state.doc.content.size;
    const from = mode === "replace" ? replaceAllFrom : state.selection.from;
    const to = mode === "replace" ? replaceAllTo : state.selection.to;

    const applied = await applyPasteClassifierFlowToView(
      this.editor.view,
      text,
      {
        from,
        to,
        classificationProfile: context?.classificationProfile,
        sourceFileType: context?.sourceFileType,
        sourceMethod: context?.sourceMethod,
        structuredHints: context?.structuredHints,
        schemaElements: context?.schemaElements,
      }
    );
    if (!applied) return;

    this.editor.commands.focus(mode === "replace" ? "start" : "end");
    this.pageModel.refreshPageModel(true);
    this.scheduleCharacterWidowFix();
    this.emitState();
    this.requestProductionSelfCheck(text);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        this.pageModel.refreshPageModel(true);
        this.scheduleCharacterWidowFix();
        this.emitState();
      });
    }
  };

  importStructuredBlocks = async (
    blocks: ScreenplayBlock[],
    mode: FileImportMode = "replace"
  ): Promise<void> => {
    if (!blocks || blocks.length === 0) return;

    const sourceText = blocks
      .map((block) => (block.text ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!sourceText) return;

    // تمرير البلوكات الأصلية كـ structuredHints عشان الـ paste-classifier
    // يستفيد منها + يتخطى الـ unstructured pipeline تلقائياً
    await this.importClassifiedText(sourceText, mode, {
      structuredHints: blocks,
    });
  };

  getBlocks = (): ScreenplayBlock[] =>
    htmlToScreenplayBlocks(this.getAllHtml());

  hasSelection = (): boolean => !this.editor.state.selection.empty;

  copySelectionToClipboard = async (): Promise<boolean> => {
    const selectionOnly = this.hasSelection();
    return copyToClipboard(this.editor, selectionOnly);
  };

  cutSelectionToClipboard = async (): Promise<boolean> => {
    return cutToClipboard(this.editor);
  };

  pasteFromClipboard = async (origin: ClipboardOrigin): Promise<boolean> => {
    return pasteFromClipboard(
      origin,
      (
        text: string,
        mode: "insert",
        context?: { classificationProfile?: "paste" | "generic-open" }
      ) => this.importClassifiedText(text, mode, context),
      (blocks: ScreenplayBlock[], mode: "insert") =>
        this.importStructuredBlocks(blocks, mode)
    );
  };

  destroy(): void {
    this.editor.off("update", this.handleEditorUpdate);
    this.editor.off("selectionUpdate", this.handleSelectionUpdate);
    this.editor.off("transaction", this.handleSelectionUpdate);
    if (typeof window !== "undefined") {
      window.removeEventListener(
        PASTE_CLASSIFIER_ERROR_EVENT,
        this.handlePasteClassifierError as EventListener
      );
    }
    this.characterWidowFixer.cancel();
    this.pageModel.disconnectObservers();
    this.editor.destroy();
  }

  private readonly handleEditorUpdate = (): void => {
    this.pageModel.refreshPageModel();
    this.scheduleCharacterWidowFix();
    this.emitState();
    this.props.onContentChange?.(this.getAllText());
  };

  private readonly handleSelectionUpdate = (): void => {
    const current = this.getCurrentFormat();
    this.props.onFormatChange?.(current);
  };

  private readonly handlePasteClassifierError = (event: Event): void => {
    const customEvent = event as CustomEvent<{ message?: unknown }>;
    const rawMessage = customEvent.detail?.message;
    const message =
      typeof rawMessage === "string" && rawMessage.trim().length > 0
        ? rawMessage
        : "تعذر تطبيق نظام الشك على النص الملصوق.";
    this.props.onImportError?.(message);
  };

  private requestProductionSelfCheck(text: string): void {
    if (this.hasRequestedProductionSelfCheck) return;
    this.hasRequestedProductionSelfCheck = true;

    void import("../../extensions/production-self-check")
      .then(({ runProductionSelfCheck }) =>
        runProductionSelfCheck({
          trigger: "editor-import",
          sampleText: text,
          force: false,
        })
      )
      .catch((error) => {
        logger.warn("Production self-check failed during editor import path", {
          scope: "editor-area",
          data: error,
        });
      });
  }

  private scheduleCharacterWidowFix(): void {
    this.characterWidowFixer.schedule(this.editor);
  }

  private emitState(): void {
    const text = this.getAllText();
    const words = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;
    const characters = text.replace(/\s+/g, "").length;
    const pages = this.pageModel.estimatedPagesCount;

    const html = this.getAllHtml();
    const scenes = (
      html.match(
        /data-type="scene_header_top_line"|data-type="scene_header_3"/g
      ) ?? []
    ).length;

    const stats: DocumentStats = {
      words,
      characters,
      pages,
      scenes,
    };

    this.props.onStatsChange?.(stats);
    this.props.onFormatChange?.(this.getCurrentFormat());
  }
}
