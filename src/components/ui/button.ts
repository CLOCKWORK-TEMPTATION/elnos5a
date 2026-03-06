import { createUiButtonPrimitive } from "./_factory";

export const createButtonPrimitive = (label = "button"): HTMLButtonElement =>
  createUiButtonPrimitive("button", label);
