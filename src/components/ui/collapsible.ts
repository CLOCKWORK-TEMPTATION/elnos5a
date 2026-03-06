import { createUiPrimitive } from "./_factory";

export const createCollapsiblePrimitive = (text = "collapsible"): HTMLElement =>
  createUiPrimitive("collapsible", text);
