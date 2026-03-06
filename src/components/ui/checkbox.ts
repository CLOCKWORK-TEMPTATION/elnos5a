import { createUiPrimitive } from "./_factory";

export const createCheckboxPrimitive = (text = "checkbox"): HTMLElement =>
  createUiPrimitive("checkbox", text);
