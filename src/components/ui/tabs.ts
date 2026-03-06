import { createUiPrimitive } from "./_factory";

export const createTabsPrimitive = (text = "tabs"): HTMLElement =>
  createUiPrimitive("tabs", text);
