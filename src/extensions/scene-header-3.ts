/**
 * @module extensions/scene_header_3
 * @description
 * رأس المشهد — المستوى الثالث (Scene Header 3): الموقع التفصيلي.
 *
 * يُصدّر:
 * - {@link isSceneHeader3Line} — كاشف أسطر الموقع التفصيلي (سياقي)
 * - {@link SceneHeader3} — عقدة Tiptap مستقلة (block)
 *
 * سلوك Enter: الانتقال إلى {@link Action} (وصف).
 *
 * يستخدم كشفاً سياقياً: إذا جاء بعد {@link SceneHeaderTopLine}
 * وعدد الكلمات ≤ 14 ولا يوجد ترقيم جمل أو أفعال وصف → يُصنّف كموقع تفصيلي.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { ClassificationContext } from "./classification-types";
import {
  SCENE_HEADER3_MULTI_LOCATION_EXACT_RE,
  SCENE_HEADER3_PREFIX_RE,
  SCENE_HEADER3_RANGE_RE,
  SCENE_NUMBER_EXACT_RE,
  TRANSITION_RE,
} from "./arabic-patterns";
import {
  hasSentencePunctuation,
  isActionVerbStart,
  matchesActionStartPattern,
  normalizeLine,
} from "./text-utils";

/**
 * يفحص ما إذا كان السطر موقعاً تفصيلياً (مثل "شقة سيد — غرفة النوم").
 *
 * يستبعد: أرقام المشاهد، الانتقالات، الجمل المُرقّمة، أفعال الوصف.
 * يقبل: بادئات أماكن معروفة، نطاقات مواقع، سياق بعد sceneHeaderTopLine.
 *
 * @param text - النص الخام
 * @param context - سياق التصنيف (اختياري)
 * @returns `true` إذا صُنّف كموقع تفصيلي
 */
export const isSceneHeader3Line = (
  text: string,
  context?: Partial<ClassificationContext>
): boolean => {
  const normalized = normalizeLine(text).replace(/:+\s*$/, "");
  if (!normalized) return false;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 14) return false;
  if (SCENE_NUMBER_EXACT_RE.test(normalized)) return false;
  if (TRANSITION_RE.test(normalized)) return false;
  if (hasSentencePunctuation(normalized)) return false;
  if (isActionVerbStart(normalized)) return false;
  if (matchesActionStartPattern(normalized)) return false;

  if (SCENE_HEADER3_PREFIX_RE.test(normalized)) return true;
  if (SCENE_HEADER3_RANGE_RE.test(normalized)) return true;
  if (SCENE_HEADER3_MULTI_LOCATION_EXACT_RE.test(normalized)) return true;

  if (context?.isAfterSceneHeaderTopLine) return true;
  if (context?.previousType === "scene_header_top_line") return true;
  if (context?.previousType === "scene_header_2") return true;
  if (context?.previousType === "scene_header_1") return true;

  return false;
};

/**
 * رأس المشهد - المستوى الثالث (Scene Header 3)
 * الموقع التفصيلي
 * مثال: "شقة سيد - غرفة النوم"
 */
export const SceneHeader3 = Node.create({
  name: "scene_header_3",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="scene_header_3"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scene_header_3",
        class: "screenplay-scene_header_3",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // الانتقال إلى الوصف/الحركة
      Enter: ({ editor }) => {
        if (!editor.isActive("scene_header_3")) return false;
        return editor.chain().focus().splitBlock().setAction().run();
      },
    };
  },
});
