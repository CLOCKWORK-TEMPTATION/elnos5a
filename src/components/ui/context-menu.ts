import { createUiPrimitive } from "./_factory";

export const createContextMenuPrimitive = (
  text = "context-menu"
): HTMLElement => createUiPrimitive("context-menu", text);
