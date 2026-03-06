import { createUiPrimitive } from "./_factory";

export const createDrawerPrimitive = (text = "drawer"): HTMLElement =>
  createUiPrimitive("drawer", text);
