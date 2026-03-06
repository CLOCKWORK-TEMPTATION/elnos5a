import { createUiPrimitive } from "./_factory";

export const createAccordionPrimitive = (text = "accordion"): HTMLElement =>
  createUiPrimitive("accordion", text);
