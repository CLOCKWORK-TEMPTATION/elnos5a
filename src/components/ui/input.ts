import { createUiPrimitive } from "./_factory";

export const createInputPrimitive = (text = "input"): HTMLElement =>
  createUiPrimitive("input", text);
