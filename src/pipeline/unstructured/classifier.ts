import type {
  UnstructuredItem,
  UnstructuredItemType,
  UnstructuredOperation,
  UnstructuredResult,
} from "./types";

type Evidence = string;

const BASMALA_RE = /^(بسم\s+الله\s+الرحمن\s+الرحيم|الله\s+الرحمن\s+الرحيم)/u;
const SCENE1_RE = /مشهد\s*\d+/u;
const SCENE2_RE = /(ليل|نهار|صباح|مساء|فجر)\s*[-–]?\s*(داخلي|خارجي)/u;
const CUT_ONLY_RE = /^قطع$/u;

const INLINE_SPEAKER_RE = /^(.{1,60}?)[：:]\s*(.+)$/u;
const PURE_SPEAKER_RE = /^\s*([^:：]{1,60})[：:]\s*$/u;

const STARTS_WITH_NARRATIVE_VERB_RE =
  /^(نرى|يدخل|تدخل|يجلس|تجلس|تقف|يقف|تخرج|يخرج|تتجه|يتجه|تضرب|ينظر|تبدو|يبدو|تفتح|يفتح|تغلق|يغلق)/u;

function normSpaces(s: string): string {
  return (s ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

function mkItem(
  i: number,
  type: UnstructuredItemType,
  raw: string,
  normalized: string,
  confidence: number,
  evidence: Evidence[]
): UnstructuredItem {
  return { i, type, raw, normalized, confidence, evidence };
}

export function classifyUnstructuredLines(lines: string[]): UnstructuredResult {
  const operations: UnstructuredOperation[] = [];
  const items: UnstructuredItem[] = [];
  let idx = 1;

  const push = (
    type: UnstructuredItemType,
    raw: string,
    normalized: string,
    conf: number,
    ev: Evidence[]
  ): void => {
    items.push(mkItem(idx++, type, raw, normalized, conf, ev));
  };

  let pendingHeader3 = false;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const norm = normSpaces(raw);

    if (li === 0 && BASMALA_RE.test(norm)) {
      push("BASMALA", raw, "بسم الله الرحمن الرحيم", 0.98, [
        "E_BASMALA_PREFIX",
      ]);
      continue;
    }

    if (CUT_ONLY_RE.test(norm)) {
      pendingHeader3 = false;
      push("TRANSITION", raw, "قطع", 0.99, ["E_TRANSITION_CUT"]);
      continue;
    }

    if (pendingHeader3) {
      const looksSpeaker =
        PURE_SPEAKER_RE.test(norm) || INLINE_SPEAKER_RE.test(norm);
      const looksVerb = STARTS_WITH_NARRATIVE_VERB_RE.test(norm);
      const looksCut = CUT_ONLY_RE.test(norm);
      const looksHeader1 = SCENE1_RE.test(norm);
      const looksHeader2 = SCENE2_RE.test(norm);

      if (
        !looksSpeaker &&
        !looksVerb &&
        !looksCut &&
        !looksHeader1 &&
        !looksHeader2
      ) {
        pendingHeader3 = false;
        operations.push({
          op: "SPLIT",
          at: idx,
          detail: `Header-3 inferred from next line: "${norm}"`,
        });
        push("scene_header_3", raw, norm, 0.78, ["E_LOCATION_LINE_NEXT"]);
        continue;
      }

      pendingHeader3 = false;
    }

    const hasScene1 = SCENE1_RE.test(norm);
    const hasScene2 = SCENE2_RE.test(norm);

    if (hasScene1 || hasScene2) {
      const m1 = norm.match(SCENE1_RE);
      if (m1) {
        const h1 = m1[0].replace(/\s+/g, " ").trim();
        operations.push({
          op: "SPLIT",
          at: idx,
          detail: `Extract scene_header_1 from: "${norm}"`,
        });
        push("scene_header_1", raw, h1, 0.95, ["E_SCENE_1_MATCH"]);
      }

      const m2 = norm.match(SCENE2_RE);
      if (m2) {
        const h2 = `${m2[1]}-${m2[2]}`.replace(/\s+/g, "");
        operations.push({
          op: "SPLIT",
          at: idx,
          detail: `Extract scene_header_2 from: "${norm}"`,
        });
        push("scene_header_2", raw, h2, 0.92, ["E_SCENE_2_MATCH"]);
      }

      const possibleLocation = norm
        .replace(SCENE1_RE, "")
        .replace(SCENE2_RE, "")
        .trim()
        .replace(/^[-–]+/u, "")
        .trim();

      if (possibleLocation && possibleLocation.length >= 3) {
        const startsWithVerb =
          STARTS_WITH_NARRATIVE_VERB_RE.test(possibleLocation);
        const looksSpeaker =
          INLINE_SPEAKER_RE.test(possibleLocation) ||
          PURE_SPEAKER_RE.test(possibleLocation);

        if (!startsWithVerb && !looksSpeaker) {
          operations.push({
            op: "SPLIT",
            at: idx,
            detail: `Extract scene_header_3 from same line: "${norm}"`,
          });
          push("scene_header_3", raw, possibleLocation, 0.8, [
            "E_LOCATION_LINE_SAME",
          ]);
        } else {
          pendingHeader3 = true;
        }
      } else {
        pendingHeader3 = true;
      }

      continue;
    }

    const inline = norm.match(INLINE_SPEAKER_RE);
    if (inline) {
      const speaker = inline[1].trim();
      const spoken = inline[2].trim();

      if (!STARTS_WITH_NARRATIVE_VERB_RE.test(norm)) {
        operations.push({
          op: "SPLIT",
          at: idx,
          detail: `Inline speaker split: "${norm}"`,
        });
        push("CHARACTER", raw, `${speaker} :`, 0.9, ["E_INLINE_SPEAKER_SPLIT"]);
        push("DIALOGUE", raw, spoken, 0.9, ["E_DIALOGUE_AFTER_SPEAKER"]);
        continue;
      }
    }

    if (PURE_SPEAKER_RE.test(norm)) {
      const normalized = norm.replace(/：/gu, ":");
      push("CHARACTER", raw, normalized, 0.95, ["E_SPEAKER_COLON"]);
      continue;
    }

    push("ACTION", raw, norm, 0.72, ["E_FALLBACK_ACTION"]);
  }

  return { version: "unstructured-v1", operations, items };
}
