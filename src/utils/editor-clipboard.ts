import type { Editor } from "@tiptap/core";
import {
  FILMLANE_CLIPBOARD_MIME,
  type ClipboardOrigin,
  type EditorClipboardPayload,
} from "../types/editor-clipboard";
import type { ScreenplayBlock } from "../utils/file-import";
import { htmlToScreenplayBlocks } from "../utils/file-import";

/**
 * @description أدوات مساعدة لعمليات الحافظة في محرر السيناريو
 */

// Hash function for text validation
const hashText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

// Validate clipboard payload structure
const isValidClipboardPayload = (
  value: unknown
): value is EditorClipboardPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EditorClipboardPayload>;
  if (typeof candidate.plainText !== "string") return false;
  if (typeof candidate.hash !== "string") return false;
  if (typeof candidate.createdAt !== "string") return false;
  if (
    candidate.sourceKind !== "selection" &&
    candidate.sourceKind !== "document"
  )
    return false;
  if (candidate.blocks && !Array.isArray(candidate.blocks)) return false;
  return true;
};

/**
 * @description نسخ النص المحدد أو المستند كاملاً إلى الحافظة
 */
export const copyToClipboard = async (
  editor: Editor,
  selectionOnly = false
): Promise<boolean> => {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;

  const hasSelection = !editor.state.selection.empty;
  const plainText = hasSelection
    ? editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        "\n"
      )
    : editor.getText();

  if (!plainText.trim()) return false;

  const blocks =
    selectionOnly || !hasSelection
      ? undefined
      : htmlToScreenplayBlocks(editor.getHTML());

  const payload: EditorClipboardPayload = {
    plainText,
    blocks,
    sourceKind: hasSelection ? "selection" : "document",
    hash: hashText(plainText),
    createdAt: new Date().toISOString(),
  };

  const serializedPayload = JSON.stringify(payload);

  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      typeof navigator.clipboard.write === "function"
    ) {
      const clipboardItem = new ClipboardItem({
        "text/plain": new Blob([plainText], { type: "text/plain" }),
        [FILMLANE_CLIPBOARD_MIME]: new Blob([serializedPayload], {
          type: FILMLANE_CLIPBOARD_MIME,
        }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return true;
    }
  } catch {
    // fallback to plain text write when custom MIME fails.
  }

  if (typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(plainText);
    return true;
  }

  return false;
};

/**
 * @description قص النص المحدد من المحرر ونسخه إلى الحافظة
 */
export const cutToClipboard = async (editor: Editor): Promise<boolean> => {
  if (editor.state.selection.empty) return false;

  const copied = await copyToClipboard(editor, true);
  if (!copied) return false;

  return editor.chain().focus().deleteSelection().run();
};

/**
 * @description لصق النص من الحافظة إلى المحرر مع التصنيف التلقائي
 */
export const pasteFromClipboard = async (
  origin: ClipboardOrigin,
  importClassifiedText: (
    text: string,
    mode: "insert",
    context?: { classificationProfile?: "paste" | "generic-open" }
  ) => Promise<void>,
  importStructuredBlocks: (
    blocks: ScreenplayBlock[],
    mode: "insert"
  ) => Promise<void>
): Promise<boolean> => {
  void origin;
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;

  try {
    if (typeof navigator.clipboard.read === "function") {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes(FILMLANE_CLIPBOARD_MIME)) {
          const payloadBlob = await item.getType(FILMLANE_CLIPBOARD_MIME);
          const payloadText = await payloadBlob.text();
          const parsed = JSON.parse(payloadText) as unknown;
          if (
            isValidClipboardPayload(parsed) &&
            parsed.hash === hashText(parsed.plainText)
          ) {
            if (parsed.blocks && parsed.blocks.length > 0) {
              await importStructuredBlocks(parsed.blocks, "insert");
              return true;
            }

            if (parsed.plainText.trim()) {
              await importClassifiedText(parsed.plainText, "insert", {
                classificationProfile: "paste",
              });
              return true;
            }
          }
        }

        if (item.types.includes("text/plain")) {
          const plainBlob = await item.getType("text/plain");
          const text = await plainBlob.text();
          if (text.trim()) {
            await importClassifiedText(text, "insert", {
              classificationProfile: "paste",
            });
            return true;
          }
        }
      }
    }
  } catch {
    // fallback to readText below.
  }

  if (typeof navigator.clipboard.readText !== "function") return false;

  const text = await navigator.clipboard.readText();
  if (!text.trim()) return false;

  await importClassifiedText(text, "insert", {
    classificationProfile: "paste",
  });
  return true;
};
