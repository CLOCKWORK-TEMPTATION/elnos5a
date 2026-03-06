import { createUiPrimitive } from "./_factory";

export const createPopoverPrimitive = (text = "popover"): HTMLElement =>
  createUiPrimitive("popover", text);
