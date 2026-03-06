/**
 * @module extensions/scene_header_top_line
 * @description
 * سطر رأس المشهد العلوي (Scene Header Top Line) — عقدة مركّبة تحتوي:
 * - {@link SceneHeader1} (يمين): رقم المشهد
 * - {@link SceneHeader2} (يسار): الزمن + داخلي/خارجي
 *
 * يُعرض بتخطيط flex مع justify-content: space-between.
 *
 * يُصدّر:
 * - {@link SceneHeaderTopLineParts} — واجهة الأجزاء المُحلّلة
 * - {@link splitSceneHeaderLine} — محلّل سطر رأس المشهد إلى جزأين
 * - {@link isCompleteSceneHeaderLine} — كاشف السطر الكامل (رقم + زمن/موقع)
 * - {@link SceneHeaderTopLine} — عقدة Tiptap المركّبة
 *
 * سلوك Enter: header1 → ينتقل إلى header2، header2 → يُنشئ scene_header_3 بعده.
 * سلوك Tab: header1 → ينتقل إلى header2.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { SCENE_NUMBER_EXACT_RE } from "./arabic-patterns";
import { isSceneHeader2Line } from "./scene-header-2";
import { normalizeLine } from "./text-utils";

/** أجزاء سطر رأس المشهد المُحلّلة: رقم المشهد + الوصف. */
export interface SceneHeaderTopLineParts {
  header1: string;
  header2: string;
}

/**
 * يُحلّل سطر رأس المشهد إلى جزأين: header1 (رقم المشهد) و header2 (الزمن/الموقع).
 *
 * يدعم الفصل بـ tab، نقطتين، شرطات، فواصل.
 *
 * @param line - النص الخام لسطر رأس المشهد
 * @returns كائن {@link SceneHeaderTopLineParts} أو `null` إذا لم يُطابق
 */
export const splitSceneHeaderLine = (
  line: string
): SceneHeaderTopLineParts | null => {
  const raw = line ?? "";
  const normalized = normalizeLine(raw)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ");
  if (!normalized) return null;

  const sceneMatch = normalized.match(/^((?:مشهد|scene)\s*[0-9٠-٩]+)\s*(.*)$/i);
  if (!sceneMatch) return null;

  const header1Base = sceneMatch[1].replace(/\s+/g, " ").trim();
  const afterMatch = sceneMatch[2] ?? "";

  if (!afterMatch.trim()) {
    return { header1: header1Base, header2: "" };
  }

  const cleaned = afterMatch.replace(/^[\s:،,–—-]+/, "").trim();
  if (!cleaned) return { header1: header1Base, header2: "" };

  const colonIdx = cleaned.indexOf(":");
  if (colonIdx !== -1) {
    const beforeColon = normalizeLine(cleaned.slice(0, colonIdx));
    const afterColon = normalizeLine(cleaned.slice(colonIdx + 1));
    if (afterColon) {
      const header1 = beforeColon
        ? `${header1Base} ${beforeColon}`.trim()
        : header1Base;
      return { header1, header2: afterColon };
    }
  }

  return {
    header1: header1Base,
    header2: normalizeLine(cleaned).replace(/[–—]/g, "-"),
  };
};

/**
 * يتحقق أن السطر يمثل رأس مشهد علوي كامل (رقم مشهد + زمن/موقع صالح).
 *
 * @param line - النص الخام
 * @returns `true` إذا احتوى على رقم مشهد + header2 صالح
 */
export const isCompleteSceneHeaderLine = (line: string): boolean => {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  if (!SCENE_NUMBER_EXACT_RE.test(normalized)) return false;

  const parts = splitSceneHeaderLine(normalized);
  if (!parts || !parts.header2) return false;

  return isSceneHeader2Line(parts.header2);
};

/**
 * سطر رأس المشهد العلوي (Scene Header Top Line)
 * عقدة مركبة تحتوي على scene_header_1 (يمين) و scene_header_2 (يسار) على نفس السطر
 * تُعرض بتخطيط flex مع justify-content: space-between
 */
export const SceneHeaderTopLine = Node.create({
  name: "scene_header_top_line",
  group: "block",
  content: "scene_header_1 scene_header_2",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="scene_header_top_line"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scene_header_top_line",
        class: "screenplay-scene_header_top_line",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Enter داخل scene_header_1 → ينتقل إلى scene_header_2
      // Enter داخل scene_header_2 → ينشئ scene_header_3 بعد السطر العلوي
      Enter: ({ editor }) => {
        // التعامل مع scene_header_1
        if (editor.isActive("scene_header_1")) {
          const { state } = editor;
          const { $from } = state.selection;

          // البحث عن scene_header_top_line الأب
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === "scene_header_top_line") {
              const topLineNode = $from.node(d);
              const topLineContentStart = $from.start(d);
              const sceneHeader1Size = topLineNode.child(0).nodeSize;
              // موضع بداية محتوى scene_header_2
              const sceneHeader2ContentPos =
                topLineContentStart + sceneHeader1Size + 1;

              return editor
                .chain()
                .command(({ tr }) => {
                  tr.setSelection(
                    TextSelection.create(tr.doc, sceneHeader2ContentPos)
                  );
                  return true;
                })
                .run();
            }
          }
          return false;
        }

        // التعامل مع scene_header_2
        if (editor.isActive("scene_header_2")) {
          const { state } = editor;
          const { $from } = state.selection;

          // البحث عن scene_header_top_line الأب
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === "scene_header_top_line") {
              const afterTopLine = $from.after(d);

              return editor
                .chain()
                .command(({ tr }) => {
                  const sceneHeader3 =
                    state.schema.nodes["scene_header_3"].create();
                  tr.insert(afterTopLine, sceneHeader3);
                  tr.setSelection(
                    TextSelection.create(tr.doc, afterTopLine + 1)
                  );
                  return true;
                })
                .run();
            }
          }
          return false;
        }

        return false;
      },

      // Tab داخل scene_header_1 → ينتقل إلى scene_header_2
      Tab: ({ editor }) => {
        if (editor.isActive("scene_header_1")) {
          const { state } = editor;
          const { $from } = state.selection;

          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === "scene_header_top_line") {
              const topLineNode = $from.node(d);
              const topLineContentStart = $from.start(d);
              const sceneHeader1Size = topLineNode.child(0).nodeSize;
              const sceneHeader2ContentPos =
                topLineContentStart + sceneHeader1Size + 1;

              return editor
                .chain()
                .command(({ tr }) => {
                  tr.setSelection(
                    TextSelection.create(tr.doc, sceneHeader2ContentPos)
                  );
                  return true;
                })
                .run();
            }
          }
        }

        return false;
      },
    };
  },
});
