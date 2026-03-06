import { createUiPrimitive } from "./_factory";

export const createBreadcrumbPrimitive = (text = "breadcrumb"): HTMLElement =>
  createUiPrimitive("breadcrumb", text);
