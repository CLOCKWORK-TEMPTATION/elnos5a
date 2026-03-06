import { createUiPrimitive } from "./_factory";

export const createAlertDialogPrimitive = (
  text = "alert-dialog"
): HTMLElement => createUiPrimitive("alert-dialog", text);
