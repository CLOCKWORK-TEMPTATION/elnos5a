import type { Editor } from "@tiptap/core";
import type { ElementType } from "../../extensions/classification-types";
import type { ScreenplayBlock } from "../../utils/file-import";
import type { ClipboardOrigin } from "../../types/editor-clipboard";
import type { RunEditorCommandOptions } from "../../types/editor-engine";
import type {
  ExtractionMethod,
  ImportedFileType,
  SchemaElement,
} from "../../types/file-import";

/**
 * @description إحصائيات المستند لغرض العرض في شريط الحالة.
 */
export interface DocumentStats {
  words: number;
  characters: number;
  pages: number;
  scenes: number;
}

/**
 * @description الأوامر المدعومة من المحرر لتنسيق النص أو التراجع.
 */
export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "align-right"
  | "align-center"
  | "align-left"
  | "undo"
  | "redo";

/**
 * @description أوضاع استيراد الملفات إلى المحرر (استبدال كامل أو إدراج في موقع المؤشر).
 */
export type FileImportMode = "replace" | "insert";

export interface ImportClassificationContext {
  sourceFileType?: ImportedFileType;
  sourceMethod?: ExtractionMethod;
  classificationProfile?: "paste" | "generic-open";
  structuredHints?: ScreenplayBlock[];
  schemaElements?: SchemaElement[];
}

/**
 * @description مقبض واجهة المحرر (Editor Handle) المُصدَّر للمكونات الأب للتحكم الخارجي.
 */
export interface EditorHandle {
  /**
   * مرجع لكائن Tiptap الأساسي.
   */
  readonly editor: Editor;
  getAllText: () => string;
  getAllHtml: () => string;
  focusEditor: () => void;
  clear: () => void;
  runCommand: (command: EditorCommand | RunEditorCommandOptions) => boolean;
  setFormat: (format: ElementType) => boolean;
  getCurrentFormat: () => ElementType | null;
  importClassifiedText: (
    text: string,
    mode?: FileImportMode,
    context?: ImportClassificationContext
  ) => Promise<void>;
  importStructuredBlocks: (
    blocks: ScreenplayBlock[],
    mode?: FileImportMode
  ) => Promise<void>;
  getBlocks: () => ScreenplayBlock[];
  hasSelection: () => boolean;
  copySelectionToClipboard: () => Promise<boolean>;
  cutSelectionToClipboard: () => Promise<boolean>;
  pasteFromClipboard: (origin: ClipboardOrigin) => Promise<boolean>;
}

/**
 * @description خصائص مكون منطقة التحرير (Editor Area Component).
 */
export interface EditorAreaProps {
  mount: HTMLElement;
  onContentChange?: (text: string) => void;
  onStatsChange?: (stats: DocumentStats) => void;
  onFormatChange?: (format: ElementType | null) => void;
  onImportError?: (message: string) => void;
}
