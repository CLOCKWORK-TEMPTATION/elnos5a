import { createUiPrimitive } from "./_factory";

export const createSelectPrimitive = (text = "select"): HTMLElement =>
  createUiPrimitive("select", text);
