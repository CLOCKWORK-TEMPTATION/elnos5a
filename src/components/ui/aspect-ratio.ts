import { createUiPrimitive } from "./_factory";

export const createAspectRatioPrimitive = (
  text = "aspect-ratio"
): HTMLElement => createUiPrimitive("aspect-ratio", text);
