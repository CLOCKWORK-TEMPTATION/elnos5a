import { createUiPrimitive } from "./_factory";

export const createCalendarPrimitive = (text = "calendar"): HTMLElement =>
  createUiPrimitive("calendar", text);
