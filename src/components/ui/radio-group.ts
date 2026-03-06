import { createUiPrimitive } from "./_factory";

export const createRadioGroupPrimitive = (text = "radio-group"): HTMLElement =>
  createUiPrimitive("radio-group", text);
