import type {
  CircuitBreakerState,
  RemoteAIResolverPolicy,
} from "@/suspicion-engine/types";

/**
 * @module resolvers/circuit-breaker
 * @description
 * قاطع الدائرة — يحمي نقطة نهاية AI من التحميل الزائد عند حدوث أعطال متتالية.
 *
 * الحالات الثلاث:
 * - closed  → الطلبات مسموح بها دائماً
 * - open    → الطلبات محظورة حتى انتهاء فترة التهدئة
 * - half-open → يُسمح بعدد محدود من الطلبات الاستطلاعية
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private lastOpenedAt = 0;
  private halfOpenProbeCount = 0;

  constructor(private readonly policy: RemoteAIResolverPolicy) {}

  get currentState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * يتحقق إذا كان مسموحاً بإرسال طلب الآن.
   * قد يُحوّل الحالة من open إلى half-open إذا انتهت فترة التهدئة.
   */
  isRequestAllowed(): boolean {
    if (this.state === "closed") {
      return true;
    }

    if (this.state === "open") {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= this.policy.circuitOpenDurationMs) {
        // انتهت فترة التهدئة — الانتقال إلى half-open
        this.state = "half-open";
        this.halfOpenProbeCount = 0;
        return true;
      }
      return false;
    }

    // half-open: يُسمح بعدد محدود من الطلبات الاستطلاعية
    return this.halfOpenProbeCount < this.policy.halfOpenProbeLimit;
  }

  /**
   * يُسجّل نجاح طلب — يُعيد الحالة إلى closed ويُصفّر العدادات.
   */
  recordSuccess(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.halfOpenProbeCount = 0;
  }

  /**
   * يُسجّل فشل طلب:
   * - closed  → يزيد عداد الأخطاء، وإذا بلغ الحد → open
   * - half-open → يُفتح الدائرة فوراً
   * - open   → لا إجراء (الدائرة مفتوحة بالفعل)
   */
  recordFailure(): void {
    if (this.state === "closed") {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.policy.consecutiveTimeoutThreshold) {
        this.state = "open";
        this.lastOpenedAt = Date.now();
      }
    } else if (this.state === "half-open") {
      this.state = "open";
      this.lastOpenedAt = Date.now();
      this.halfOpenProbeCount = 0;
    }
    // open → لا إجراء
  }

  /**
   * يزيد عداد الطلبات الاستطلاعية في وضع half-open.
   * يجب استدعاؤه عند إرسال طلب استطلاعي.
   */
  incrementProbeCount(): void {
    if (this.state === "half-open") {
      this.halfOpenProbeCount++;
    }
  }
}
