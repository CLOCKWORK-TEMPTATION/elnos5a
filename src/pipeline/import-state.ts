/**
 * @fileoverview Import State — إدارة حالة عمليات الاستيراد
 *
 * يحفظ:
 * - snapshots للعناصر المستوردة
 * - requestIds المطبقة (لـ idempotency)
 * - fingerprints للتحقق من التغييرات
 *
 * @module pipeline/import-state
 */

import { logger } from "../utils/logger";

const importStateLogger = logger.createScope("import-state");

/** معلومات العنصر المستورد */
export interface ImportItem {
  itemId: string;
  type: string;
  text: string;
  fingerprint: string;
  rawTextLength: number;
}

/** Snapshot لعملية استيراد */
export interface ImportSnapshot {
  importOpId: string;
  createdAt: number;
  items: Map<string, ImportItem>;
  appliedRequestIds: Set<string>;
}

// تخزين في الذاكرة للـ snapshots النشطة
const activeSnapshots = new Map<string, ImportSnapshot>();

/**
 * إنشاء snapshot جديد لعملية استيراد
 */
export function createImportSnapshot(
  importOpId: string,
  items: Array<{ _itemId?: string; type: string; text: string }>
): ImportSnapshot {
  const itemMap = new Map<string, ImportItem>();

  for (const item of items) {
    if (!item._itemId) continue;

    const fingerprint = calculateFingerprint(item.type, item.text);

    itemMap.set(item._itemId, {
      itemId: item._itemId,
      type: item.type,
      text: item.text,
      fingerprint,
      rawTextLength: item.text.length,
    });
  }

  const snapshot: ImportSnapshot = {
    importOpId,
    createdAt: Date.now(),
    items: itemMap,
    appliedRequestIds: new Set(),
  };

  activeSnapshots.set(importOpId, snapshot);

  importStateLogger.info("snapshot-created", {
    importOpId,
    itemCount: itemMap.size,
  });

  // تنظيف snapshots القديمة (> 5 دقائق)
  cleanupOldSnapshots();

  return snapshot;
}

/**
 * الحصول على snapshot موجود
 */
export function getImportSnapshot(
  importOpId: string
): ImportSnapshot | undefined {
  return activeSnapshots.get(importOpId);
}

/**
 * التحقق من وجود requestId (لـ idempotency)
 */
export function hasRequestId(importOpId: string, requestId: string): boolean {
  const snapshot = activeSnapshots.get(importOpId);
  if (!snapshot) return false;
  return snapshot.appliedRequestIds.has(requestId);
}

/**
 * إضافة requestId للـ snapshot
 */
export function addRequestId(importOpId: string, requestId: string): void {
  const snapshot = activeSnapshots.get(importOpId);
  if (snapshot) {
    snapshot.appliedRequestIds.add(requestId);

    importStateLogger.info("request-id-added", {
      importOpId,
      requestId,
      totalApplied: snapshot.appliedRequestIds.size,
    });
  }
}

/**
 * التحقق من fingerprint match
 */
export function verifyFingerprint(
  importOpId: string,
  itemId: string,
  expectedFingerprint: string
): boolean {
  const snapshot = activeSnapshots.get(importOpId);
  if (!snapshot) {
    importStateLogger.warn("snapshot-not-found-for-fingerprint", {
      importOpId,
      itemId,
    });
    return false;
  }

  const item = snapshot.items.get(itemId);
  if (!item) {
    importStateLogger.warn("item-not-found-for-fingerprint", {
      importOpId,
      itemId,
    });
    return false;
  }

  const matches = item.fingerprint === expectedFingerprint;

  if (!matches) {
    importStateLogger.info("fingerprint-mismatch", {
      importOpId,
      itemId,
      expected: expectedFingerprint.slice(0, 8) + "...",
      actual: item.fingerprint.slice(0, 8) + "...",
    });
  }

  return matches;
}

/**
 * الحصول على العنصر من snapshot
 */
export function getSnapshotItem(
  importOpId: string,
  itemId: string
): ImportItem | undefined {
  const snapshot = activeSnapshots.get(importOpId);
  return snapshot?.items.get(itemId);
}

/**
 * حساب fingerprint للعنصر ( synchronous )
 *
 * fingerprint = sha1(type + "\u241F" + rawText)
 * - بدون trim
 * - المسافات الداخلية كما هي
 * - بدون NFC/NFD
 * - newline يدخل كما هو
 */
export function calculateFingerprint(type: string, rawText: string): string {
  // استخدام unit separator (U+241F) كفاصل
  const separator = "\u241F";
  const content = type + separator + rawText;

  // Simple hash for synchronous usage
  return simpleHash(content);
}

/**
 * Simple hash function (synchronous)
 */
function simpleHash(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * تنظيف snapshots القديمة (> 5 دقائق)
 */
function cleanupOldSnapshots(): void {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  for (const [importOpId, snapshot] of activeSnapshots.entries()) {
    if (snapshot.createdAt < fiveMinutesAgo) {
      activeSnapshots.delete(importOpId);
      importStateLogger.info("old-snapshot-cleaned", { importOpId });
    }
  }
}

// Extend ImportSnapshot interface for use with hasRequestId/addRequestId
export interface ImportSnapshotWithIdMethods extends ImportSnapshot {
  hasRequestId: (requestId: string) => boolean;
  addRequestId: (requestId: string) => void;
}

/**
 * إنشاء snapshot مع methods مدمجة
 */
export function createImportSnapshotWithMethods(
  importOpId: string,
  items: Array<{ _itemId?: string; type: string; text: string }>
): ImportSnapshotWithIdMethods {
  const snapshot = createImportSnapshot(importOpId, items);

  return {
    ...snapshot,
    hasRequestId(requestId: string): boolean {
      return snapshot.appliedRequestIds.has(requestId);
    },
    addRequestId(requestId: string): void {
      snapshot.appliedRequestIds.add(requestId);
    },
  };
}
