import { createUiPrimitive } from "./_factory";

export const createInputOtpPrimitive = (text = "input-otp"): HTMLElement =>
  createUiPrimitive("input-otp", text);
