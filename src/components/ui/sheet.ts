import { createUiPrimitive } from "./_factory";

export const createSheetPrimitive = (text = "sheet"): HTMLElement =>
  createUiPrimitive("sheet", text);
