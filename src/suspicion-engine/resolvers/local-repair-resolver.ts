import type { SuspicionResolver } from "@/suspicion-engine/resolvers/resolver-interface";
import type {
  SuspicionCase,
  ResolutionOutcome,
} from "@/suspicion-engine/types";
import { assignRoute } from "@/suspicion-engine/routing/routing-policy";

/**
 * @module resolvers/local-repair-resolver
 * @description
 * مُحلّ الإصلاح المحلي — يُعالج الأسطر التي تحتوي على إشارات تلف (corruption)
 * ويُعيدها إلى مرحلة إعادة التصنيف بعد الإصلاح.
 */
export const localRepairResolver: SuspicionResolver = {
  name: "local-repair",

  canHandle(suspicionCase: SuspicionCase): boolean {
    const route = assignRoute(suspicionCase);
    return (
      route === "repair-then-reclassify" &&
      suspicionCase.summary.corruption.length > 0
    );
  },

  resolve(suspicionCase: SuspicionCase): ResolutionOutcome {
    const { lineIndex, summary } = suspicionCase;

    const corruptionSignals = summary.corruption;
    const evidenceUsed = corruptionSignals.map((s) => s.signalId);

    return {
      lineIndex,
      status: "repair-and-reclassify",
      correctedType: null,
      confidence: null,
      resolverName: "local-repair",
      evidenceUsed,
      appliedAt: "pre-render",
    };
  },
};
