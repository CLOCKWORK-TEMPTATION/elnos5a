import { createUiPrimitive } from "./_factory";

export const createScrollAreaPrimitive = (text = "scroll-area"): HTMLElement =>
  createUiPrimitive("scroll-area", text);
