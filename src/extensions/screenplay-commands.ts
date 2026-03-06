import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

// تعريف الأوامر المخصصة لعناصر السيناريو
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    screenplay: {
      setBasmala: () => ReturnType;
      setSceneHeaderTopLine: () => ReturnType;
      setSceneHeader3: () => ReturnType;
      setAction: () => ReturnType;
      setCharacter: () => ReturnType;
      setDialogue: () => ReturnType;
      setParenthetical: () => ReturnType;
      setTransition: () => ReturnType;
    };
  }
}

/**
 * أوامر السيناريو - يوفر أوامر لتحويل الفقرات إلى عناصر السيناريو المختلفة
 */
export const ScreenplayCommands = Extension.create({
  name: "screenplayCommands",

  addCommands() {
    return {
      setBasmala:
        () =>
        ({ commands }) => {
          return commands.setNode("basmala");
        },

      /**
       * إنشاء سطر رأس المشهد العلوي (يحتوي scene_header_1 + scene_header_2)
       * يستبدل الكتلة الحالية بالعقدة المركبة
       */
      setSceneHeaderTopLine:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const sceneHeaderTopLine =
            state.schema.nodes["scene_header_top_line"];
          const sceneHeader1 = state.schema.nodes["scene_header_1"];
          const sceneHeader2 = state.schema.nodes["scene_header_2"];

          if (!sceneHeaderTopLine || !sceneHeader1 || !sceneHeader2)
            return false;

          // إذا كنا بالفعل داخل scene_header_top_line، ركّز على scene_header_1
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === "scene_header_top_line") {
              if (dispatch) {
                const topLineContentStart = $from.start(d);
                tr.setSelection(
                  TextSelection.create(tr.doc, topLineContentStart + 1)
                );
                dispatch(tr);
              }
              return true;
            }
          }

          // إنشاء العقدة المركبة الجديدة
          const topLineNode = sceneHeaderTopLine.create(null, [
            sceneHeader1.create(),
            sceneHeader2.create(),
          ]);

          // البحث عن عمق الكتلة المباشر تحت المستند
          let depth = $from.depth;
          while (depth > 0 && $from.node(depth - 1).type.name !== "doc") {
            depth--;
          }
          if (depth === 0) return false;

          if (dispatch) {
            const from = $from.before(depth);
            const to = $from.after(depth);
            tr.replaceWith(from, to, topLineNode);
            // وضع المؤشر داخل scene_header_1
            tr.setSelection(TextSelection.create(tr.doc, from + 2));
            dispatch(tr);
          }
          return true;
        },

      setSceneHeader3:
        () =>
        ({ commands }) => {
          return commands.setNode("scene_header_3");
        },
      setAction:
        () =>
        ({ commands }) => {
          return commands.setNode("action");
        },
      setCharacter:
        () =>
        ({ commands }) => {
          return commands.setNode("character");
        },
      setDialogue:
        () =>
        ({ commands }) => {
          return commands.setNode("dialogue");
        },
      setParenthetical:
        () =>
        ({ commands }) => {
          return commands.setNode("parenthetical");
        },
      setTransition:
        () =>
        ({ commands }) => {
          return commands.setNode("transition");
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Tab للتنقل بين أنواع العناصر (أعلى مستوى)
      // ملاحظة: Tab داخل scene_header_1/2 يُدار من SceneHeaderTopLine
      Tab: ({ editor }) => {
        // لا نتدخل إذا كنا داخل scene_header_top_line (يُدار من هناك)
        if (editor.isActive("scene_header_1")) return false;
        if (editor.isActive("scene_header_2")) return false;

        if (editor.isActive("basmala")) {
          return editor.commands.setSceneHeaderTopLine();
        }
        if (editor.isActive("scene_header_top_line")) {
          return editor.commands.setSceneHeader3();
        }
        if (editor.isActive("scene_header_3")) {
          return editor.commands.setAction();
        }
        if (editor.isActive("action")) {
          return editor.commands.setCharacter();
        }
        if (editor.isActive("character")) {
          return editor.commands.setDialogue();
        }
        if (editor.isActive("dialogue")) {
          return editor.commands.setParenthetical();
        }
        if (editor.isActive("parenthetical")) {
          return editor.commands.setTransition();
        }
        if (editor.isActive("transition")) {
          return editor.commands.setSceneHeaderTopLine();
        }
        // الافتراضي
        return editor.commands.setAction();
      },
    };
  },
});
