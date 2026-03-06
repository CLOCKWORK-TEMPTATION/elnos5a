import { createUiButtonPrimitive } from "./_factory";

export const createSwitchPrimitive = (label = "switch"): HTMLButtonElement =>
  createUiButtonPrimitive("switch", label);
