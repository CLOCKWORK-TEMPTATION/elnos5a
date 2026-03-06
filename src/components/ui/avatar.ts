import { createUiPrimitive } from "./_factory";

export const createAvatarPrimitive = (text = "avatar"): HTMLElement =>
  createUiPrimitive("avatar", text);
