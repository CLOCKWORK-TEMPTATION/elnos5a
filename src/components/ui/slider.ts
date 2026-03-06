import { createUiPrimitive } from "./_factory";

export const createSliderPrimitive = (text = "slider"): HTMLElement =>
  createUiPrimitive("slider", text);
