import { createUiPrimitive } from "./_factory";

export const createPaginationPrimitive = (text = "pagination"): HTMLElement =>
  createUiPrimitive("pagination", text);
