import type { SuspicionResolver } from "@/suspicion-engine/resolvers/resolver-interface";
import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  SuspicionCase,
  ResolutionOutcome,
  RoutingSummary,
} from "@/suspicion-engine/types";
import { assignRoute } from "@/suspicion-engine/routing/routing-policy";
import { toExternalBand } from "@/suspicion-engine/routing/route-types";
import { noopResolver } from "@/suspicion-engine/resolvers/noop-resolver";
import type { RemoteAIResolver } from "@/suspicion-engine/resolvers/remote-ai-resolver";

/**
 * @module resolvers/resolution-coordinator
 * @description
 * منسّق القرار — يُنسّق عمل سلسلة المُحلّلات على جميع حالات الاشتباه،
 * ويُنتج نتائج الحل ومُلخّص التوجيه.
 *
 * ترتيب سلسلة المُحلّلات: LocalDeterministic → LocalRepair → NoOp
 */
export class ResolutionCoordinator {
  constructor(private readonly resolvers: readonly SuspicionResolver[]) {}

  /**
   * يُعالج جميع حالات الاشتباه قبل العرض (pre-render).
   * كل حالة تحصل على مُحلّل واحد بالضبط — أول مُحلّل قادر على التعامل معها.
   */
  resolvePreRender(
    cases: readonly SuspicionCase[]
  ): readonly ResolutionOutcome[] {
    return cases.map((suspicionCase) => {
      const resolver = this.resolvers.find((r) => r.canHandle(suspicionCase));
      // سلسلة المُحلّلات تنتهي دائماً بـ NoOp الذي يقبل كل الحالات
      // لذا لن تكون resolver غير معرّفة أبداً في الاستخدام الصحيح
      if (resolver === undefined) {
        throw new Error(
          `[ResolutionCoordinator] لا يوجد مُحلّل لحالة السطر ${suspicionCase.lineIndex}. تأكد من تضمين NoopResolver في النهاية.`
        );
      }
      return resolver.resolve(suspicionCase);
    });
  }

  /**
   * يُعالج حالات agent-candidate وagent-forced بعد العرض (post-render) عبر AI.
   *
   * - يُصفّي الحالات إلى النطاقين المدعومين فقط
   * - يُرتّبها بحسب الأولوية: agent-forced أولاً
   * - إذا كان aiResolver غير متاح → تُؤجَّل جميع الحالات
   * - إذا فشل aiResolver → يتراجع إلى noop
   */
  async resolvePostRenderAsync(
    cases: readonly SuspicionCase[],
    allClassifiedLines: readonly ClassifiedDraft[],
    aiResolver: RemoteAIResolver | null
  ): Promise<readonly ResolutionOutcome[]> {
    // تصفية إلى الحالات التي تحتاج AI فقط
    const agentCases = cases.filter(
      (c) => c.band === "agent-candidate" || c.band === "agent-forced"
    );

    // ترتيب: agent-forced أولاً
    const sorted = [...agentCases].sort((a, b) => {
      if (a.band === "agent-forced" && b.band !== "agent-forced") return -1;
      if (b.band === "agent-forced" && a.band !== "agent-forced") return 1;
      return 0;
    });

    if (aiResolver === null) {
      return sorted.map((c) => noopResolver.resolve(c));
    }

    const outcomes: ResolutionOutcome[] = [];

    for (const suspicionCase of sorted) {
      try {
        const outcome = await aiResolver.resolve(
          suspicionCase,
          allClassifiedLines
        );
        outcomes.push(outcome);
      } catch {
        outcomes.push(noopResolver.resolve(suspicionCase));
      }
    }

    return outcomes;
  }

  /**
   * يبني مُلخّص التوجيه من حالات الاشتباه ونتائج الحل.
   */
  buildRoutingSummary(
    cases: readonly SuspicionCase[],
    outcomes: readonly ResolutionOutcome[]
  ): RoutingSummary {
    let pass = 0;
    let localReview = 0;
    let agentCandidate = 0;
    let agentForced = 0;
    let autoFixedLocally = 0;
    let repairedAndReclassified = 0;
    let deferred = 0;

    for (const suspicionCase of cases) {
      const route = assignRoute(suspicionCase);
      const externalBand = toExternalBand(route);

      if (externalBand === "pass") pass++;
      else if (externalBand === "local-review") localReview++;
      else if (externalBand === "agent-candidate") agentCandidate++;
      else if (externalBand === "agent-forced") agentForced++;
    }

    for (const outcome of outcomes) {
      if (outcome.status === "relabel") autoFixedLocally++;
      else if (outcome.status === "repair-and-reclassify")
        repairedAndReclassified++;
      else if (outcome.status === "deferred") deferred++;
    }

    return {
      total: cases.length,
      pass,
      localReview,
      agentCandidate,
      agentForced,
      autoFixedLocally,
      repairedAndReclassified,
      deferred,
    };
  }
}
