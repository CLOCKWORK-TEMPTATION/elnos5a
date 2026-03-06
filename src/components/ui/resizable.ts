import { createUiPrimitive } from "./_factory";

export const createResizablePrimitive = (text = "resizable"): HTMLElement =>
  createUiPrimitive("resizable", text);
