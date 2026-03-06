import { createUiPrimitive } from "./_factory";

export const createTextareaPrimitive = (text = "textarea"): HTMLElement =>
  createUiPrimitive("textarea", text);
