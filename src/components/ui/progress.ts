import { createUiPrimitive } from "./_factory";

export const createProgressPrimitive = (text = "progress"): HTMLElement =>
  createUiPrimitive("progress", text);
