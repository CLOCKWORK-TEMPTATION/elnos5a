/**
 * @fileoverview Editor Insertion — إدراج العناصر المصنفة في المحرر
 *
 * @module pipeline/editor-insertion
 */

import type { EditorView } from "@tiptap/pm/view";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { ElementType } from "../extensions/classification-types";
import { logger } from "../utils/logger";

const insertionLogger = logger.createScope("editor-insertion");

/** عنصر مصنف مع معرف */
export interface ClassifiedItem {
  _itemId: string;
  type: ElementType;
  text: string;
  confidence?: number;
  classificationMethod?: string;
}

/** خيارات الإدراج */
export interface InsertionOptions {
  from?: number;
  to?: number;
}

/**
 * إدراج عناصر مصنفة في المحرر
 */
export async function insertClassifiedItems(
  view: EditorView,
  items: ClassifiedItem[],
  options: InsertionOptions = {}
): Promise<void> {
  const { from = 0, to = view.state.doc.content.size } = options;

  insertionLogger.info("inserting-classified-items", {
    itemCount: items.length,
    from,
    to,
  });

  const tr = view.state.tr;

  // بناء عقد ProseMirror من العناصر المصنفة
  const nodes = items
    .map((item) => {
      const nodeType = view.state.schema.nodes[item.type];
      if (!nodeType) {
        insertionLogger.warn("unknown-node-type", { type: item.type });
        return null;
      }

      // إنشاء العقدة مع البيانات الوصفية
      const node = nodeType.create(
        { "data-item-id": item._itemId },
        view.state.schema.text(item.text)
      );

      return node;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (nodes.length === 0) {
    insertionLogger.warn("no-nodes-to-insert");
    return;
  }

  // إنشاء Fragment و Slice
  const fragment = Fragment.from(nodes);
  const slice = new Slice(fragment, 0, 0);

  // استبدال المحتوى
  tr.replaceRange(from, to, slice);
  view.dispatch(tr);

  insertionLogger.info("items-inserted", {
    count: nodes.length,
  });
}
