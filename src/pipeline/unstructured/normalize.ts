export interface UnstructuredNormalizeOptions {
  replaceBullets?: boolean;
  collapseBlankLines?: boolean;
}

export function normalizeForUnstructuredWork(
  raw: string,
  opt: UnstructuredNormalizeOptions = {}
): string {
  let s = (raw ?? "").replace(/\r\n/g, "\n");

  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n");

  if (opt.replaceBullets ?? true) {
    s = s.replace(//gu, "\n");
  }

  if (opt.collapseBlankLines ?? true) {
    s = s.replace(/\n{3,}/g, "\n\n");
  }

  return s;
}
