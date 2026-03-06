import { createUiPrimitive } from "./_factory";

export const createToggleGroupPrimitive = (
  text = "toggle-group"
): HTMLElement => createUiPrimitive("toggle-group", text);
