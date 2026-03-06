import { createUiPrimitive } from "./_factory";

export const createChartPrimitive = (text = "chart"): HTMLElement =>
  createUiPrimitive("chart", text);
