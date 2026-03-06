import { createUiPrimitive } from "./_factory";

export const createCommandPrimitive = (text = "command"): HTMLElement =>
  createUiPrimitive("command", text);
