import { createUiPrimitive } from "./_factory";

export const createCardPrimitive = (text = "card"): HTMLElement =>
  createUiPrimitive("card", text);
