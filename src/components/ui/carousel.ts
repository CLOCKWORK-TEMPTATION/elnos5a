import { createUiPrimitive } from "./_factory";

export const createCarouselPrimitive = (text = "carousel"): HTMLElement =>
  createUiPrimitive("carousel", text);
