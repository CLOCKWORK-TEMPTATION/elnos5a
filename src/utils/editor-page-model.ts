import type { Editor } from "@tiptap/core";
import { CONTENT_HEIGHT_PX } from "../constants";

/**
 * @description إدارة نموذج الصفحات ومراقبتها في محرر السيناريو
 */
export class EditorPageModel {
  private editor: Editor;
  private body: HTMLDivElement;
  private hasPagesExtension: boolean;
  private resizeObserver: ResizeObserver | null = null;
  private paginationObserver: MutationObserver | null = null;
  private estimatedPages = 1;
  private onPageModelChange?: () => void;

  constructor(
    editor: Editor,
    body: HTMLDivElement,
    hasPagesExtension: boolean,
    onPageModelChange?: () => void
  ) {
    this.editor = editor;
    this.body = body;
    this.hasPagesExtension = hasPagesExtension;
    this.onPageModelChange = onPageModelChange;
  }

  /**
   * @description ربط مراقبي نموذج الصفحات
   */
  bindObservers(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleWindowResize);
    }

    if (typeof ResizeObserver === "undefined") return;

    const attachObserver = (): void => {
      const editorRoot = this.body.querySelector<HTMLElement>(
        ".filmlane-prosemirror-root, .ProseMirror"
      );
      if (!editorRoot) return;

      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        this.refreshPageModel();
        this.onPageModelChange?.();
      });
      this.resizeObserver.observe(editorRoot);
    };

    attachObserver();
    window.setTimeout(attachObserver, 0);

    if (typeof MutationObserver === "undefined") return;

    this.paginationObserver?.disconnect();
    this.paginationObserver = new MutationObserver(() => {
      this.refreshPageModel();
      this.onPageModelChange?.();
    });
    this.paginationObserver.observe(this.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * @description فصل مراقبي نموذج الصفحات
   */
  disconnectObservers(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.handleWindowResize);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.paginationObserver?.disconnect();
    this.paginationObserver = null;
  }

  /**
   * @description تحديث نموذج الصفحات
   */
  refreshPageModel(force = false): void {
    const pagesFromStorage = this.getPagesFromExtensionStorage();
    const nextPages =
      pagesFromStorage ??
      (this.hasPagesExtension
        ? this.estimatedPages
        : this.measurePageEstimate());

    if (!force && nextPages === this.estimatedPages) return;

    this.estimatedPages = nextPages;
  }

  /**
   * @description قياس تقدير عدد الصفحات
   */
  private measurePageEstimate(): number {
    const editorRoot = this.body.querySelector<HTMLElement>(
      ".filmlane-prosemirror-root, .ProseMirror"
    );
    if (!editorRoot) return 1;

    const pageBodyHeight = Math.max(1, CONTENT_HEIGHT_PX);
    const contentHeight = Math.max(1, editorRoot.scrollHeight);
    return Math.max(1, Math.ceil(contentHeight / pageBodyHeight));
  }

  /**
   * @description الحصول على عدد الصفحات من امتداد الصفحات
   */
  private getPagesFromExtensionStorage(): number | null {
    const storage = this.editor.storage as {
      pages?: { getPageCount?: () => number };
    };
    const pages = storage.pages?.getPageCount?.();
    if (typeof pages !== "number" || !Number.isFinite(pages)) return null;
    return Math.max(1, Math.floor(pages));
  }

  /**
   * @description معالج تغيير حجم النافذة
   */
  private handleWindowResize = (): void => {
    this.refreshPageModel();
    this.onPageModelChange?.();
  };

  /**
   * @description الحصول على عدد الصفحات المقدر
   */
  get estimatedPagesCount(): number {
    return this.estimatedPages;
  }
}
