/**
 * @module pipeline/packet-budget
 * @description ميزانية الحزمة — المرحلة 9 من إعادة الهيكلة
 *
 * يتحكم في حجم الحزمة المُرسلة للوكيل لتجنب تجاوز حدود الرموز
 * وضمان استجابة سريعة حتى مع النصوص الطويلة.
 */

// ─── إعدادات وحدود الحزمة ───────────────────────────────────────

export interface PacketBudgetConfig {
  /** الحد الأقصى لعدد الأسطر المشبوهة في طلب واحد */
  maxSuspiciousLinesPerRequest: number;
  /** الحد الأقصى لعدد أحرف معاينة كل سطر */
  maxCharsPerLinePreview: number;
  /** الحد الأقصى لعدد العناصر الإلزامية (forced) في طلب واحد */
  maxForcedItemsPerRequest: number;
  /** الحد الأقصى لعدد أحرف الحزمة الكاملة */
  maxPacketChars: number;
  /** مهلة الوكيل بالمللي ثانية */
  agentTimeoutMs: number;
  /** عدد محاولات إعادة المحاولة (واحد فقط للشبكة/5xx) */
  retryCount: number;
}

/** القيم الافتراضية */
export const DEFAULT_PACKET_BUDGET: PacketBudgetConfig = {
  maxSuspiciousLinesPerRequest: 30,
  maxCharsPerLinePreview: 500,
  maxForcedItemsPerRequest: 15,
  maxPacketChars: 24_000,
  agentTimeoutMs: 25_000,
  retryCount: 1,
};

// ─── عنصر مشبوه مُعدّ للإرسال ─────────────────────────────────

export interface SuspiciousItemForPacket {
  /** معرف العنصر */
  itemId: string;
  /** هل هو forced */
  isForced: boolean;
  /** درجة الشك */
  suspicionScore: number;
  /** طول النص */
  textLength: number;
  /** النص المُقتطع (حسب maxCharsPerLinePreview) */
  previewText: string;
  /** الحجم التقريبي بالأحرف عند التسلسل في الحزمة */
  estimatedChars: number;
}

// ─── الأولوية والترتيب ─────────────────────────────────────────

/**
 * ترتيب العناصر المشبوهة حسب أولوية التضمين في الحزمة:
 * 1) forced أولاً
 * 2) الأعلى suspicion score
 * 3) (اختياري) الأقصر لتحسين الكثافة
 */
export const sortByPriority = (
  items: readonly SuspiciousItemForPacket[]
): SuspiciousItemForPacket[] => {
  return [...items].sort((a, b) => {
    // forced أولاً
    if (a.isForced && !b.isForced) return -1;
    if (!a.isForced && b.isForced) return 1;

    // الأعلى suspicion
    if (b.suspicionScore !== a.suspicionScore) {
      return b.suspicionScore - a.suspicionScore;
    }

    // الأقصر (لتحسين الكثافة)
    return a.textLength - b.textLength;
  });
};

// ─── بناء الحزمة مع احترام الميزانية ──────────────────────────

export interface PacketBuildResult {
  /** العناصر المُضمّنة في هذه الحزمة */
  included: SuspiciousItemForPacket[];
  /** العناصر التي لم تتسع — تُرسل في chunk لاحق */
  overflow: SuspiciousItemForPacket[];
  /** إجمالي الأحرف المُقدّر */
  totalEstimatedChars: number;
  /** هل تم اقتطاع بسبب الميزانية */
  wasTruncated: boolean;
}

/**
 * بناء حزمة واحدة مع احترام حدود الميزانية.
 */
export const buildPacketWithBudget = (
  sortedItems: readonly SuspiciousItemForPacket[],
  config: PacketBudgetConfig = DEFAULT_PACKET_BUDGET
): PacketBuildResult => {
  const included: SuspiciousItemForPacket[] = [];
  const overflow: SuspiciousItemForPacket[] = [];
  let totalChars = 0;
  let forcedCount = 0;

  for (const item of sortedItems) {
    // فحص حد العناصر
    if (included.length >= config.maxSuspiciousLinesPerRequest) {
      overflow.push(item);
      continue;
    }

    // فحص حد forced
    if (item.isForced && forcedCount >= config.maxForcedItemsPerRequest) {
      overflow.push(item);
      continue;
    }

    // فحص حد الأحرف
    if (totalChars + item.estimatedChars > config.maxPacketChars) {
      // استثناء: forced يتجاوز الحد إذا لم يُضمّن أي عنصر بعد
      if (item.isForced && included.length === 0) {
        included.push(item);
        totalChars += item.estimatedChars;
        forcedCount += 1;
        continue;
      }
      overflow.push(item);
      continue;
    }

    included.push(item);
    totalChars += item.estimatedChars;
    if (item.isForced) forcedCount += 1;
  }

  return {
    included,
    overflow,
    totalEstimatedChars: totalChars,
    wasTruncated: overflow.length > 0,
  };
};

// ─── تقسيم إلى chunks ──────────────────────────────────────────

export interface ChunkPlan {
  /** عدد الحزم */
  chunkCount: number;
  /** الحزم */
  chunks: PacketBuildResult[];
}

/**
 * تقسيم مجموعة عناصر إلى حزم متعددة إذا لزم الأمر.
 * كل chunk تحت نفس importOpId لكن requestId مختلف.
 */
export const planChunks = (
  items: readonly SuspiciousItemForPacket[],
  config: PacketBudgetConfig = DEFAULT_PACKET_BUDGET
): ChunkPlan => {
  const sorted = sortByPriority(items);
  const chunks: PacketBuildResult[] = [];
  let remaining = sorted;

  while (remaining.length > 0) {
    const result = buildPacketWithBudget(remaining, config);
    if (result.included.length === 0) {
      // لا يمكن تضمين أي عنصر — توقف لتجنب حلقة لا نهائية
      break;
    }
    chunks.push(result);
    remaining = result.overflow;
  }

  return {
    chunkCount: chunks.length,
    chunks,
  };
};

// ─── تقدير حجم عنصر مشبوه ──────────────────────────────────────

/**
 * تحضير عنصر مشبوه للتضمين في الحزمة مع تقدير حجمه.
 */
export const prepareItemForPacket = (
  itemId: string,
  text: string,
  suspicionScore: number,
  isForced: boolean,
  config: PacketBudgetConfig = DEFAULT_PACKET_BUDGET
): SuspiciousItemForPacket => {
  const previewText = text.slice(0, config.maxCharsPerLinePreview);
  // تقدير تقريبي: المعرف + النوع + النص + metadata ≈ +100 حرف
  const estimatedChars = previewText.length + 100;

  return {
    itemId,
    isForced,
    suspicionScore,
    textLength: text.length,
    previewText,
    estimatedChars,
  };
};
