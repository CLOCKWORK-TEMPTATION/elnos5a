import { createUiPrimitive } from "./_factory";

export const createSeparatorPrimitive = (text = "separator"): HTMLElement =>
  createUiPrimitive("separator", text);
