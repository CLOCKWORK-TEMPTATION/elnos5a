import { createUiPrimitive } from "./_factory";

export const createSidebarPrimitive = (text = "sidebar"): HTMLElement =>
  createUiPrimitive("sidebar", text);
