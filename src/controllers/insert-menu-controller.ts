import type { EditorArea } from "../components/editor";
import { insertMenuDefinitions, type EditorStyleFormatId } from "../constants";
import { fromLegacyElementType } from "../extensions/classification-types";

export type InsertActionId =
  | `insert-template:${EditorStyleFormatId}`
  | `photo-montage:${EditorStyleFormatId}`;

export interface MenuToastPayload {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}

type InsertMenuActionRuntime = {
  actionId: InsertActionId;
  area: EditorArea;
  toast: (payload: MenuToastPayload) => void;
  getNextPhotoMontageNumber: () => number;
};

const INSERT_DEFINITION_BY_ID = insertMenuDefinitions.reduce<
  Record<EditorStyleFormatId, (typeof insertMenuDefinitions)[number]>
>(
  (acc, definition) => {
    acc[definition.id] = definition;
    return acc;
  },
  {} as Record<EditorStyleFormatId, (typeof insertMenuDefinitions)[number]>
);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSceneHeaderTopLineHtml = (
  header1: string,
  header2: string
): string => {
  const safeHeader1 = escapeHtml(header1.trim());
  const safeHeader2 = escapeHtml(header2.trim());
  return `<div data-type="scene_header_top_line"><div data-type="scene_header_1">${safeHeader1}</div><div data-type="scene_header_2">${safeHeader2}</div></div>`;
};

export const isInsertActionId = (
  actionId: string
): actionId is InsertActionId =>
  actionId.startsWith("insert-template:") ||
  actionId.startsWith("photo-montage:");

export const runInsertMenuAction = ({
  actionId,
  area,
  toast,
  getNextPhotoMontageNumber,
}: InsertMenuActionRuntime): void => {
  const [behavior, rawId] = actionId.split(":") as [
    "insert-template" | "photo-montage",
    EditorStyleFormatId,
  ];
  const definition = INSERT_DEFINITION_BY_ID[rawId];
  const template = (definition.defaultTemplate ?? "").trim();
  const sceneHeader1Template = (
    INSERT_DEFINITION_BY_ID["scene_header_1"].defaultTemplate ?? "مشهد 1:"
  ).trim();
  const sceneHeader2Template = (
    INSERT_DEFINITION_BY_ID["scene_header_2"].defaultTemplate ??
    "داخلي - المكان - الوقت"
  ).trim();

  if (behavior === "photo-montage") {
    const montageNumber = getNextPhotoMontageNumber();
    const montageHeader = `فوتو مونتاج ${montageNumber}`;
    area.editor
      .chain()
      .focus()
      .insertContent(
        buildSceneHeaderTopLineHtml(montageHeader, "مشاهد متتابعة")
      )
      .run();
    toast({
      title: "تم إدراج فوتو مونتاج",
      description: `تم إنشاء ${montageHeader}.`,
    });
    return;
  }

  if (definition.id === "scene_header_1") {
    area.editor
      .chain()
      .focus()
      .insertContent(
        buildSceneHeaderTopLineHtml(
          template || sceneHeader1Template,
          sceneHeader2Template
        )
      )
      .run();
    toast({
      title: "تم الإدراج",
      description: "تم إدراج رأس المشهد (1) ضمن سطر رأس المشهد.",
    });
    return;
  }

  if (definition.id === "scene_header_2") {
    area.editor
      .chain()
      .focus()
      .insertContent(
        buildSceneHeaderTopLineHtml(
          sceneHeader1Template,
          template || sceneHeader2Template
        )
      )
      .run();
    toast({
      title: "تم الإدراج",
      description: "تم إدراج رأس المشهد (2) ضمن سطر رأس المشهد.",
    });
    return;
  }

  const mappedElementType = fromLegacyElementType(definition.id);
  if (!mappedElementType) {
    toast({
      title: "تعذر الإدراج",
      description: `نوع الإدراج ${definition.id} غير مدعوم في المحرك الحالي.`,
      variant: "destructive",
    });
    return;
  }

  area.setFormat(mappedElementType);
  if (template) {
    area.editor.chain().focus().insertContent(escapeHtml(template)).run();
  }
  toast({
    title: "تم الإدراج",
    description: `تم إدراج قالب ${definition.label}.`,
  });
};
