import { createUiPrimitive } from "./_factory";

export const createTablePrimitive = (text = "table"): HTMLElement =>
  createUiPrimitive("table", text);
