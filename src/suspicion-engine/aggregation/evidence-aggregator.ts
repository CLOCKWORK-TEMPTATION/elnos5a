import type {
  SuspicionSignal,
  SignalFamilySummary,
} from "@/suspicion-engine/types";
import type { ElementType } from "@/extensions/classification-types";

// ─── aggregateEvidence ────────────────────────────────────────────────────────

/**
 * تجميع الإشارات في 5 مجموعات عائلية دون إسقاط أي منها.
 *
 * كل إشارة تُصنَّف حسب خاصية `family` إلى مجموعتها المناسبة:
 * - gate-break  → gateBreak
 * - context     → context
 * - corruption  → corruption
 * - cross-pass  → crossPass
 * - source      → source
 *
 * @param signals - الإشارات المرصودة للسطر
 * @returns ملخص العائلات مع الإشارات موزعة على مجموعاتها
 */
export function aggregateEvidence(
  signals: readonly SuspicionSignal[]
): SignalFamilySummary {
  const gateBreak: SuspicionSignal[] = [];
  const context: SuspicionSignal[] = [];
  const corruption: SuspicionSignal[] = [];
  const crossPass: SuspicionSignal[] = [];
  const source: SuspicionSignal[] = [];

  for (const signal of signals) {
    switch (signal.family) {
      case "gate-break":
        gateBreak.push(signal);
        break;
      case "context":
        context.push(signal);
        break;
      case "corruption":
        corruption.push(signal);
        break;
      case "cross-pass":
        crossPass.push(signal);
        break;
      case "source":
        source.push(signal);
        break;
    }
  }

  return {
    gateBreak,
    context,
    corruption,
    crossPass,
    source,
  };
}

// ─── derivePrimarySuggestedType ───────────────────────────────────────────────

/**
 * استخراج النوع المقترح الأكثر شيوعاً عبر جميع الإشارات (تصويت أغلبية).
 *
 * يُحسب عدد الإشارات التي تقترح كل نوع، ويُعاد النوع الأعلى تكراراً.
 * في حالة التعادل يُعاد أول نوع ظهر بحسب ترتيب الإشارات.
 * يُعاد `null` إذا لم تحمل أي إشارة اقتراح نوع.
 *
 * @param signals - الإشارات المرصودة للسطر
 * @returns النوع المقترح الأغلب أو null
 */
export function derivePrimarySuggestedType(
  signals: readonly SuspicionSignal[]
): ElementType | null {
  const typeCounts = new Map<ElementType, number>();
  // نحتفظ بترتيب أول ظهور لكل نوع للتعامل مع التعادل بحسب الورود
  const firstSeen: ElementType[] = [];

  for (const signal of signals) {
    if (signal.suggestedType === null) continue;

    const prev = typeCounts.get(signal.suggestedType) ?? 0;
    if (prev === 0) firstSeen.push(signal.suggestedType);
    typeCounts.set(signal.suggestedType, prev + 1);
  }

  if (typeCounts.size === 0) return null;

  let bestType: ElementType = firstSeen[0];
  let bestCount = typeCounts.get(bestType) ?? 0;

  for (const type of firstSeen) {
    const count = typeCounts.get(type) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestType = type;
    }
  }

  return bestType;
}
