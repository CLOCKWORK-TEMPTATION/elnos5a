import { createUiPrimitive } from "./_factory";

export const createFormPrimitive = (text = "form"): HTMLElement =>
  createUiPrimitive("form", text);
