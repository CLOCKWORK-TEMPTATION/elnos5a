import { createUiPrimitive } from "./_factory";

export const createLabelPrimitive = (text = "label"): HTMLElement =>
  createUiPrimitive("label", text);
