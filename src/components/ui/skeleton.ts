import { createUiPrimitive } from "./_factory";

export const createSkeletonPrimitive = (text = "skeleton"): HTMLElement =>
  createUiPrimitive("skeleton", text);
