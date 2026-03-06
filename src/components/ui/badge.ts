import { createUiPrimitive } from "./_factory";

export const createBadgePrimitive = (text = "badge"): HTMLElement =>
  createUiPrimitive("badge", text);
