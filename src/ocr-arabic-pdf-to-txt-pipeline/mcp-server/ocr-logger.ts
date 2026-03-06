/**
 * @description نظام التسجيل لمحول OCR
 */

import util from "node:util";

const APP_NAME = "MistralOCRPDFConverter";

export function log(
  level: "INFO" | "WARN" | "ERROR" | "CRITICAL",
  message: string,
  ...args: unknown[]
): void {
  const ts = new Date().toISOString();
  const line = `${ts} - ${APP_NAME} - ${level} - ${util.format(message, ...args)}`;
  if (level === "ERROR" || level === "CRITICAL") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export { APP_NAME };
