import { scoreLine } from "../quality/line-quality";
import type { UnstructuredDetectResult } from "./types";

export interface UnstructuredDetectOptions {
  threshold: number;
}

export function detectUnstructured(
  text: string,
  opt: UnstructuredDetectOptions
): UnstructuredDetectResult {
  const raw = text ?? "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { applied: false, qualityScore: 1, reasons: ["EMPTY_INPUT"] };
  }

  const scores = lines.map((l) => scoreLine(l).score);
  const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const reasons: string[] = [];

  const hasSceneNoSpace = /مشهد\d+/u.test(raw);
  const hasCutSceneGlue = /قطع\s*مشهد\s*\d+/u.test(raw);
  const hasBullets = //u.test(raw);
  const inlineSpeakerCount = (raw.match(/[^:\n]{1,50}[：:]\s*\S+/gu) ?? [])
    .length;

  if (hasSceneNoSpace) reasons.push("H_SCENE_NO_SPACE");
  if (hasCutSceneGlue) reasons.push("H_CUT_SCENE_GLUE");
  if (hasBullets) reasons.push("H_BULLETS");
  if (inlineSpeakerCount >= 3) reasons.push("H_INLINE_SPEAKER_MANY");

  const applied = avg < opt.threshold || reasons.length > 0;

  if (avg < opt.threshold) {
    reasons.unshift(`Q_BELOW_THRESHOLD_${opt.threshold.toFixed(2)}`);
  }

  return { applied, qualityScore: clamp01(avg), reasons };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
