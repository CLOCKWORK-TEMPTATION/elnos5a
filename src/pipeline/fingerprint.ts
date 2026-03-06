/**
 * @module pipeline/fingerprint
 * @description مواصفة البصمة — لتحديد هوية العناصر قبل/بعد إرسالها للوكيل.
 *
 * الصيغة المعتمدة:
 *   fingerprint = sha1(type + "\u241F" + rawText)
 *
 * قواعد rawText:
 * - بدون trim()
 * - المسافات الداخلية كما هي
 * - بدون Unicode normalization (NFC/NFD)
 * - أي newline داخل النص يدخل كما هو
 */

/** فاصل حقول Unicode (U+241F) — يُستخدم بين النوع والنص في حساب البصمة */
const FIELD_SEPARATOR = "\u241F";

/**
 * حساب SHA-1 باستخدام Web Crypto API (متوفر في المتصفح و Node ≥ 15).
 * يُعيد hex string مكون من 40 حرفاً.
 */
const sha1Hex = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // المتصفح: window.crypto.subtle — Node: globalThis.crypto.subtle
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * حساب SHA-1 بشكل متزامن باستخدام fallback بسيط (djb2 مزدوج).
 * يُستخدم فقط إذا لم تتوفر Web Crypto API.
 * ملاحظة: هذا ليس SHA-1 حقيقي ولكنه hash كافٍ للمقارنة الداخلية.
 */
const djb2FallbackHash = (input: string): string => {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + ch) | 0;
    h2 = ((h2 << 5) + h2 + ch) | 0;
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}`;
};

/**
 * توليد بصمة لعنصر واحد.
 *
 * @param type - نوع العنصر (مثل "dialogue", "action")
 * @param rawText - النص الخام بدون أي تطبيع
 * @returns بصمة hex — sha1 إذا توفرت Web Crypto، وإلا djb2
 */
export const computeFingerprint = async (
  type: string,
  rawText: string
): Promise<string> => {
  const payload = `${type}${FIELD_SEPARATOR}${rawText}`;
  try {
    return await sha1Hex(payload);
  } catch {
    // fallback إذا لم تتوفر Web Crypto (بيئات اختبار قديمة)
    return djb2FallbackHash(payload);
  }
};

/**
 * توليد بصمة متزامن — يُستخدم في السياقات التي لا تدعم async.
 * يستخدم djb2 fallback مباشرة.
 */
export const computeFingerprintSync = (
  type: string,
  rawText: string
): string => {
  const payload = `${type}${FIELD_SEPARATOR}${rawText}`;
  return djb2FallbackHash(payload);
};

/**
 * لقطة عنصر — تحفظ الحالة الأصلية للعنصر المُرسل للوكيل.
 */
export interface ItemSnapshot {
  /** معرف العنصر الفريد */
  readonly itemId: string;
  /** بصمة العنصر وقت الإرسال */
  readonly fingerprint: string;
  /** نوع العنصر وقت الإرسال */
  readonly type: string;
  /** النص الخام وقت الإرسال */
  readonly rawText: string;
}

/**
 * بناء لقطات لمجموعة عناصر — تُستخدم قبل إرسال الحزمة للوكيل.
 */
export const buildItemSnapshots = async (
  items: ReadonlyArray<{
    itemId: string;
    type: string;
    rawText: string;
  }>
): Promise<ItemSnapshot[]> => {
  const snapshots: ItemSnapshot[] = [];
  for (const item of items) {
    const fingerprint = await computeFingerprint(item.type, item.rawText);
    snapshots.push({
      itemId: item.itemId,
      fingerprint,
      type: item.type,
      rawText: item.rawText,
    });
  }
  return snapshots;
};

/**
 * مطابقة بصمة عنصر واحد — تُرجع true إذا تطابقت البصمة الحالية مع اللقطة.
 */
export const matchesSnapshot = async (
  snapshot: ItemSnapshot,
  currentType: string,
  currentRawText: string
): Promise<boolean> => {
  const currentFingerprint = await computeFingerprint(
    currentType,
    currentRawText
  );
  return currentFingerprint === snapshot.fingerprint;
};
