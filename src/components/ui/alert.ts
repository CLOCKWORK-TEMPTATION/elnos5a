import { createUiPrimitive } from "./_factory";

export const createAlertPrimitive = (text = "alert"): HTMLElement =>
  createUiPrimitive("alert", text);
