import type {
  ClassificationTrace,
  SuspicionSignal,
  SuspicionFeature,
} from "@/suspicion-engine/types";
import type { ClassifiedDraft } from "@/extensions/classification-types";

export interface DetectorContext {
  readonly lineIndex: number;
  readonly totalLines: number;
  readonly neighbors: readonly ClassifiedDraft[];
  readonly neighborTraces: readonly ClassificationTrace[];
  readonly features: SuspicionFeature;
}

export type DetectorFn = (
  trace: ClassificationTrace,
  line: ClassifiedDraft,
  context: DetectorContext
) => readonly SuspicionSignal[];
