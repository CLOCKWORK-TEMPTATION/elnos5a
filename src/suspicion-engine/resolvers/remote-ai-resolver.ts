import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  AIReviewPayload,
  RemoteAIResolverPolicy,
  ResolutionOutcome,
  SuspicionCase,
} from "@/suspicion-engine/types";
import { buildAIReviewPayload } from "@/suspicion-engine/adapters/to-ai-payload";
import { parseAIVerdict } from "@/suspicion-engine/adapters/from-ai-verdict";
import { CircuitBreaker } from "@/suspicion-engine/resolvers/circuit-breaker";

/**
 * @module resolvers/remote-ai-resolver
 * @description
 * محلّ الذكاء الاصطناعي عن بُعد — يُرسل حالات الاشتباه الحرجة إلى نقطة نهاية AI
 * ويُعيد نتائج حل مكتوبة بدقة.
 *
 * يستخدم قاطع الدائرة لحماية نقطة النهاية من الأخطاء المتتالية.
 * في حالة انتهاء المهلة أو حدوث خطأ يُؤجّل الحل بدلاً من الفشل.
 */
export class RemoteAIResolver {
  readonly name = "remote-ai";

  constructor(
    private readonly circuitBreaker: CircuitBreaker,
    private readonly policy: RemoteAIResolverPolicy,
    private readonly sendToAI: (
      payload: AIReviewPayload
    ) => Promise<Record<string, unknown>>
  ) {}

  /**
   * يتحقق إذا كان يمكن معالجة الحالة:
   * - النطاق يجب أن يكون agent-candidate أو agent-forced
   * - قاطع الدائرة يجب أن يسمح بالطلب
   */
  canHandle(suspicionCase: SuspicionCase): boolean {
    const isAgentBand =
      suspicionCase.band === "agent-candidate" ||
      suspicionCase.band === "agent-forced";

    if (!isAgentBand) return false;

    return this.circuitBreaker.isRequestAllowed();
  }

  /**
   * يُعالج حالة الاشتباه عن طريق إرسالها إلى AI.
   *
   * الخطوات:
   * 1. بناء حمولة المراجعة
   * 2. إرسالها مع مهلة زمنية
   * 3. تحليل الاستجابة وإعادة النتيجة
   *
   * عند انتهاء المهلة أو حدوث خطأ: تُسجّل الفشل وتُعيد deferred.
   */
  async resolve(
    suspicionCase: SuspicionCase,
    allClassifiedLines: readonly ClassifiedDraft[]
  ): Promise<ResolutionOutcome> {
    const { lineIndex, signals } = suspicionCase;
    const evidenceUsed = signals.map((s) => s.signalId);

    // بناء حمولة المراجعة
    const payload = buildAIReviewPayload(suspicionCase, allClassifiedLines);

    // إعداد مهلة الطلب
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `[RemoteAIResolver] انتهت مهلة الطلب (${this.policy.requestTimeoutMs}ms)`
          )
        );
      }, this.policy.requestTimeoutMs);
    });

    // زيادة عداد الطلبات الاستطلاعية إذا كنا في وضع half-open
    this.circuitBreaker.incrementProbeCount();

    try {
      const raw = await Promise.race([this.sendToAI(payload), timeoutPromise]);

      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }

      this.circuitBreaker.recordSuccess();

      return parseAIVerdict(raw, suspicionCase);
    } catch {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }

      this.circuitBreaker.recordFailure();

      return {
        lineIndex,
        status: "deferred",
        correctedType: null,
        confidence: null,
        resolverName: "remote-ai",
        evidenceUsed,
        appliedAt: null,
      };
    }
  }
}
