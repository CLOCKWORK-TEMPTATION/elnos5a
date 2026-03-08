import type { SuspicionResolver } from "@/suspicion-engine/resolvers/resolver-interface";
import type {
  SuspicionCase,
  ResolutionOutcome,
} from "@/suspicion-engine/types";
import { assignRoute } from "@/suspicion-engine/routing/routing-policy";

/**
 * @module resolvers/local-deterministic-resolver
 * @description
 * المُحلّ الحتمي المحلي — يُعيد تصنيف الأسطر التي تمتلك نوعاً مقترحاً واضحاً
 * من إشارات gate-break، دون الحاجة إلى مراجعة من الوكيل.
 */
export const localDeterministicResolver: SuspicionResolver = {
  name: "local-deterministic",

  canHandle(suspicionCase: SuspicionCase): boolean {
    const route = assignRoute(suspicionCase);
    return (
      route === "auto-local-fix" && suspicionCase.primarySuggestedType !== null
    );
  },

  resolve(suspicionCase: SuspicionCase): ResolutionOutcome {
    const { lineIndex, summary, primarySuggestedType } = suspicionCase;

    // إشارات gate-break هي المصدر الرئيسي للإصلاح الحتمي
    const gateBreakSignals = summary.gateBreak;

    // أعلى درجة ثقة من إشارات gate-break
    const highestScore =
      gateBreakSignals.length > 0
        ? Math.max(...gateBreakSignals.map((s) => s.score))
        : suspicionCase.score / 100;

    const evidenceUsed = gateBreakSignals.map((s) => s.signalId);

    return {
      lineIndex,
      status: "relabel",
      correctedType: primarySuggestedType,
      confidence: highestScore,
      resolverName: "local-deterministic",
      evidenceUsed,
      appliedAt: "pre-render",
    };
  },
};
