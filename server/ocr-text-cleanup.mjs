/**
 * إزالة الأسطر المصطنعة الناتجة عن بعض أدوات OCR:
 * - فواصل =====...
 * - وسم الصفحة: "الصفحة <رقم>"
 * - الأسطر الفارغة المرافقة مباشرة لهذه العلامات
 */

const OCR_SEPARATOR_RE = /^\s*={20,}\s*$/u;
const OCR_PAGE_LABEL_RE = /^\s*الصفحة\s+[0-9٠-٩]+\s*$/u;

const isArtifactLine = (line) =>
  OCR_SEPARATOR_RE.test(line) || OCR_PAGE_LABEL_RE.test(line);

const isBlankLine = (line) => line.trim().length === 0;

const hasArtifactNeighbor = (lines, index) => {
  const prev = index > 0 ? lines[index - 1] : "";
  const next = index < lines.length - 1 ? lines[index + 1] : "";
  return isArtifactLine(prev) || isArtifactLine(next);
};

export const stripOcrArtifactLines = (text) => {
  const source = typeof text === "string" ? text : "";
  if (!source) {
    return {
      text: "",
      removedLines: 0,
    };
  }

  const lines = source.split(/\r?\n/u);
  const cleaned = [];
  let removedLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const artifact = isArtifactLine(line);
    const relatedBlank = isBlankLine(line) && hasArtifactNeighbor(lines, index);
    if (artifact || relatedBlank) {
      removedLines += 1;
      continue;
    }
    cleaned.push(line);
  }

  return {
    text: cleaned.join("\n").trim(),
    removedLines,
  };
};
