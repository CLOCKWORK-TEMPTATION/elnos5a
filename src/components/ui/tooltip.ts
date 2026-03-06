import { createUiPrimitive } from "./_factory";

export const createTooltipPrimitive = (text = "tooltip"): HTMLElement =>
  createUiPrimitive("tooltip", text);
