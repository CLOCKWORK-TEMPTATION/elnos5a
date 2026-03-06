/**
 * @module types/typing-system
 * @description أنماط نظام الكتابة — تُعرّف أوضاع التصنيف التلقائي وإعدادات التأخير
 *
 * نظام الكتابة يتحكم في متى وكيف يُفعّل التصنيف التلقائي أثناء الكتابة:
 * - `plain` — لا تصنيف تلقائي (يدوي فقط)
 * - `auto-deferred` — تصنيف مؤجل (يُفعّل بأمر يدوي)
 * - `auto-live` — تصنيف حي (يُفعّل تلقائياً بعد فترة خمول)
 */

/**
 * وضع نظام الكتابة — يُحدد سلوك التصنيف التلقائي
 * - `plain` — الوضع العادي: لا تصنيف تلقائي، يدوي فقط
 * - `auto-deferred` — مؤجل: يُجهّز التصنيف لكن لا يُنفّذه تلقائياً
 * - `auto-live` — حي: يُنفّذ التصنيف تلقائياً بعد فترة خمول مُحددة
 */
export type TypingSystemMode = "plain" | "auto-deferred" | "auto-live";

/**
 * نطاق سير عمل الكتابة — يُحدد ما يُعالجه التصنيف
 * - `document` — المستند بالكامل (النطاق الوحيد المدعوم حالياً)
 */
export type TypingWorkflowScope = "document";

/**
 * مصدر تشغيل سير عمل اللصق — يُحدد كيف بدأ التصنيف
 * - `manual-deferred` — المستخدم فعّل التصنيف المؤجل يدوياً
 * - `live-idle` — فترة الخمول في الوضع الحي انقضت
 */
export type PasteWorkflowRunSource = "manual-deferred" | "live-idle";

/**
 * ملف تعريف مراجعة سير عمل اللصق
 * - `interactive` — تفاعلي: يعرض مربع حوار تأكيد قبل التطبيق
 * - `silent-live` — صامت: يُطبّق التغييرات بدون تأكيد (للوضع الحي)
 */
export type PasteWorkflowReviewProfile = "interactive" | "silent-live";

/**
 * ملف تعريف سياسة سير عمل اللصق
 * - `strict-structure` — هيكلة صارمة: قواعد تصنيف محافظة
 * - `interactive-legacy` — تفاعلي قديم: توافق مع السلوك السابق
 */
export type PasteWorkflowPolicyProfile =
  | "strict-structure"
  | "interactive-legacy";

/**
 * خيارات تشغيل سير عمل اللصق على المستند
 *
 * @property source - مصدر التشغيل (يدوي مؤجل أو خمول حي)
 * @property reviewProfile - ملف تعريف المراجعة (تفاعلي أو صامت)
 * @property policyProfile - ملف تعريف السياسة (صارم أو تفاعلي)
 * @property suppressToasts - إخفاء الإشعارات المنبثقة (اختياري)
 */
export interface RunDocumentThroughPasteWorkflowOptions {
  source: PasteWorkflowRunSource;
  reviewProfile: PasteWorkflowReviewProfile;
  policyProfile: PasteWorkflowPolicyProfile;
  suppressToasts?: boolean;
}

/**
 * إعدادات نظام الكتابة — تُخزّن في localStorage وتُحمّل عند بدء التطبيق
 *
 * @property typingSystemMode - وضع التصنيف التلقائي
 * @property liveIdleMinutes - دقائق الخمول قبل تفعيل التصنيف الحي (1-15)
 * @property liveScope - نطاق التصنيف الحي
 * @property deferredScope - نطاق التصنيف المؤجل
 * @property keepNavigationMapInPlain - إبقاء خريطة التنقل مفعّلة في الوضع العادي (ثابت: true)
 */
export interface TypingSystemSettings {
  typingSystemMode: TypingSystemMode;
  liveIdleMinutes: number;
  liveScope: TypingWorkflowScope;
  deferredScope: TypingWorkflowScope;
  keepNavigationMapInPlain: true;
}

/**
 * الإعدادات الافتراضية لنظام الكتابة — وضع عادي، 3 دقائق خمول، نطاق المستند
 */
export const DEFAULT_TYPING_SYSTEM_SETTINGS: TypingSystemSettings = {
  typingSystemMode: "plain",
  liveIdleMinutes: 3,
  liveScope: "document",
  deferredScope: "document",
  keepNavigationMapInPlain: true,
};

/**
 * تطهير إعدادات نظام الكتابة — يُطبّع القيم الواردة ويضمن صلاحيتها
 *
 * يتحقق من:
 * - صلاحية وضع الكتابة (يرجع للافتراضي إذا كانت القيمة غير معروفة)
 * - نطاق دقائق الخمول (يُقيّد بين 1 و 15، يُقرّب للأقرب)
 * - القيم الثابتة (liveScope, deferredScope, keepNavigationMapInPlain)
 *
 * @param settings - الإعدادات الواردة (قد تكون جزئية أو null أو undefined)
 * @returns إعدادات كاملة ومُطهّرة
 *
 * @example
 * ```typescript
 * // إعدادات من localStorage قد تكون تالفة
 * const raw = JSON.parse(localStorage.getItem('settings') ?? '{}')
 * const safe = sanitizeTypingSystemSettings(raw)
 * ```
 */
export const sanitizeTypingSystemSettings = (
  settings: Partial<TypingSystemSettings> | null | undefined
): TypingSystemSettings => {
  const incoming = settings ?? {};
  const rawMinutes =
    typeof incoming.liveIdleMinutes === "number"
      ? incoming.liveIdleMinutes
      : DEFAULT_TYPING_SYSTEM_SETTINGS.liveIdleMinutes;

  const normalizedMinutes = Number.isFinite(rawMinutes)
    ? Math.min(15, Math.max(1, Math.round(rawMinutes)))
    : DEFAULT_TYPING_SYSTEM_SETTINGS.liveIdleMinutes;

  const mode = incoming.typingSystemMode;
  const typingSystemMode: TypingSystemMode =
    mode === "plain" || mode === "auto-deferred" || mode === "auto-live"
      ? mode
      : DEFAULT_TYPING_SYSTEM_SETTINGS.typingSystemMode;

  return {
    typingSystemMode,
    liveIdleMinutes: normalizedMinutes,
    liveScope: "document",
    deferredScope: "document",
    keepNavigationMapInPlain: true,
  };
};

/**
 * تحويل الدقائق إلى مللي ثانية — مع ضمان قيمة موجبة لا تقل عن 1ms
 *
 * @param minutes - عدد الدقائق
 * @returns القيمة بالمللي ثانية (≥ 1)
 */
export const minutesToMilliseconds = (minutes: number): number =>
  Math.max(1, Math.round(minutes * 60_000));
