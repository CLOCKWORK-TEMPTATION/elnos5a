import { createUiPrimitive } from "./_factory";

export const createMenubarPrimitive = (text = "menubar"): HTMLElement =>
  createUiPrimitive("menubar", text);
