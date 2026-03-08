import type {
  SuspicionSignal,
  SignalFamily,
  SignalType,
  SuspicionSignalEvidence,
} from "@/suspicion-engine/types";
import type { ElementType } from "@/extensions/classification-types";

let signalCounter = 0;

export function createSignal<T extends SuspicionSignalEvidence>(params: {
  readonly lineIndex: number;
  readonly family: SignalFamily;
  readonly signalType: T["signalType"];
  readonly score: number;
  readonly reasonCode: string;
  readonly message: string;
  readonly suggestedType: ElementType | null;
  readonly evidence: T;
  readonly debug?: Record<string, string | number | boolean | null>;
}): SuspicionSignal {
  signalCounter++;
  return {
    signalId: `sig-${Date.now()}-${signalCounter}`,
    lineIndex: params.lineIndex,
    family: params.family,
    signalType: params.signalType as SignalType,
    score: params.score,
    reasonCode: params.reasonCode,
    message: params.message,
    suggestedType: params.suggestedType,
    evidence: params.evidence,
    debug: params.debug,
  };
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function resetSignalCounter(): void {
  signalCounter = 0;
}
