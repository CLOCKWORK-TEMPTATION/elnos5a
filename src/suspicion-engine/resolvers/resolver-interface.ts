import type {
  SuspicionCase,
  ResolutionOutcome,
} from "@/suspicion-engine/types";

export interface SuspicionResolver {
  readonly name: string;
  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): ResolutionOutcome;
}
