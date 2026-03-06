import { createUiButtonPrimitive } from "./_factory";

export const createTogglePrimitive = (label = "toggle"): HTMLButtonElement =>
  createUiButtonPrimitive("toggle", label);
