import type { SuspicionResolver } from "@/suspicion-engine/resolvers/resolver-interface";
import type {
  SuspicionCase,
  ResolutionOutcome,
} from "@/suspicion-engine/types";

/**
 * @module resolvers/noop-resolver
 * @description
 * المُحلّ الاحتياطي — يُستخدم كحل أخير لجميع الحالات التي لا يتولّاها
 * مُحلّ آخر. يُرجع 'deferred' للحالات التي تحتاج وكيلاً، و'confirmed'
 * للحالات التي تقع ضمن نطاق pass أو local-review.
 */
export const noopResolver: SuspicionResolver = {
  name: "noop",

  canHandle(_suspicionCase: SuspicionCase): boolean {
    // الاحتياطي — يقبل دائماً
    return true;
  },

  resolve(suspicionCase: SuspicionCase): ResolutionOutcome {
    const { lineIndex, band } = suspicionCase;

    const isAgentBand = band === "agent-candidate" || band === "agent-forced";
    const status = isAgentBand ? "deferred" : "confirmed";

    return {
      lineIndex,
      status,
      correctedType: null,
      confidence: null,
      resolverName: "noop",
      evidenceUsed: [],
      appliedAt: null,
    };
  },
};
