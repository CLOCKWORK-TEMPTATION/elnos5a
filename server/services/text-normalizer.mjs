/**
 * @description خدمات تطبيع النصوص المستخرجة من الملفات
 */

export const isObjectRecord = (value) =>
  typeof value === "object" && value !== null;

export const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const normalizeIncomingText = (value, maxLength = 50_000) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

export const stripAsciiControlChars = (value, options = {}) => {
  const { preserveTabs = false, preserveNewlines = false } = options;
  const text = String(value ?? "");
  let cleaned = "";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    const isAsciiControl = code <= 0x1f || code === 0x7f;

    if (!isAsciiControl) {
      cleaned += ch;
      continue;
    }

    if (preserveTabs && code === 0x09) {
      cleaned += ch;
      continue;
    }

    if (preserveNewlines && (code === 0x0a || code === 0x0d)) {
      cleaned += ch;
    }
  }

  return cleaned;
};

export const normalizeText = (value) =>
  stripAsciiControlChars(
    String(value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n"),
    {
      preserveNewlines: true,
    }
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const cleanExtractedDocText = (text) =>
  normalizeText(text)
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
