import { createUiPrimitive } from "./_factory";

export const createDialogPrimitive = (text = "dialog"): HTMLElement =>
  createUiPrimitive("dialog", text);
