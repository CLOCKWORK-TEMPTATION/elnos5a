import { setTimeout as sleep } from "node:timers/promises";

const BASMALA = "بسم الله الرحمن الرحيم";
const SCENE_HEADER_RE = /مشهد\s*[0-9٠-٩]+|مشهد[0-9٠-٩]+/u;
const SCENE_TIME_LOCATION_RE =
  /(نهار|ليل|صباح|مساء|فجر)\s*[-–—]\s*(داخلي|خارجي)|(داخلي|خارجي)\s*[-–—]\s*(نهار|ليل|صباح|مساء|فجر)/u;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function splitInlineMarkers(line: string): string[] {
  const repaired = line
    .replace(new RegExp(`^(${BASMALA})\\s+(مشهد[0-9٠-٩]+)`, "u"), "$1\n$2")
    .replace(/([.؟?!:])\s+-\s+(?=[\u0600-\u06FF])/gu, "$1\n- ")
    .replace(
      /([^\n])\s+(مشهد[0-9٠-٩]+(?:\s*[-–—]\s*(?:داخلي|خارجي|نهار|ليل|صباح|مساء|فجر))*)/gu,
      "$1\n$2"
    )
    .replace(/([^\n])\s+(قطع)(?=\s|$)/gu, "$1\n$2");

  return repaired
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function collectReferenceAnchors(referenceText: string): string[] {
  const anchors: string[] = [];
  for (const rawLine of normalizeText(referenceText).split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === BASMALA || line === "قطع" || SCENE_HEADER_RE.test(line)) {
      anchors.push(line);
      continue;
    }
    if (line.length <= 48 && SCENE_TIME_LOCATION_RE.test(line)) {
      anchors.push(line);
    }
  }
  return unique(anchors).sort((a, b) => b.length - a.length);
}

function splitByAnchors(lines: string[], anchors: string[]): string[] {
  if (anchors.length === 0) return lines;

  const out: string[] = [];
  for (const line of lines) {
    let pending = line;
    let changed = true;
    while (changed) {
      changed = false;
      for (const anchor of anchors) {
        const index = pending.indexOf(anchor);
        if (index > 0) {
          const left = pending.slice(0, index).trim();
          const right = pending.slice(index).trim();
          if (left && right) {
            out.push(left);
            pending = right;
            changed = true;
            break;
          }
        }
      }
    }
    if (pending.trim()) {
      out.push(pending.trim());
    }
  }

  return out;
}

export class StructuralRepair {
  repair(candidateText: string, referenceText = ""): string {
    const normalized = normalizeText(candidateText);
    const splitLines = normalized
      .split("\n")
      .flatMap((line) => splitInlineMarkers(line.trim()));

    const anchors = referenceText
      ? collectReferenceAnchors(referenceText)
      : ([] as string[]);
    const anchoredLines = splitByAnchors(splitLines, anchors);

    return `${collapseBlankLines(anchoredLines.join("\n"))}\n`;
  }
}

export async function waitForRepairStability(
  repair: StructuralRepair,
  text: string,
  referenceText = ""
): Promise<string> {
  let current = text;
  for (let i = 0; i < 3; i += 1) {
    const next = repair.repair(current, referenceText);
    if (next === current) return next;
    current = next;
    await sleep(0);
  }
  return current;
}
