/**
 * @module extensions/ai-progressive-updater
 * @description
 * آلية تحديث المحرر تدريجياً بعد العرض الفوري.
 *
 * تستقبل stream من تصحيحات AI (Gemini / Kimi / Claude)
 * وتطبّقها على ProseMirror editor في real-time.
 *
 * كل تصحيح = transaction واحد (تغيير نوع node).
 * يتعامل مع position mapping لو المستخدم عدّل أثناء الـ stream.
 *
 * يُصدّر:
 * - {@link AICorrectionCommand} — أمر تصحيح واحد من أي طبقة AI
 * - {@link AILayerSource} — مصدر الطبقة (gemini-context / gemini-doubt / claude-review)
 * - {@link ProgressiveUpdater} — الفئة الرئيسية لتطبيق التصحيحات
 * - {@link ProgressiveUpdateSession} — جلسة تحديث واحدة مرتبطة بعملية لصق/فتح
 */

import type { EditorView } from "@tiptap/pm/view";
import { Fragment, type Node as PmNode } from "@tiptap/pm/model";
import type { ElementType } from "./classification-types";
import { isElementType } from "./classification-types";
import { pipelineRecorder } from "./pipeline-recorder";
import { logger } from "../utils/logger";

// ─── الأنواع ──────────────────────────────────────────────────────

/** مصدر طبقة AI */
export type AILayerSource = "gemini-context" | "gemini-doubt" | "claude-review";

/** أمر تصحيح واحد من أي طبقة AI */
export interface AICorrectionCommand {
  /** فهرس السطر في المستند الأصلي */
  readonly lineIndex: number;
  /** النوع الجديد المقترح */
  readonly correctedType: ElementType;
  /** درجة الثقة (0–1) */
  readonly confidence: number;
  /** سبب التصحيح */
  readonly reason: string;
  /** مصدر التصحيح */
  readonly source: AILayerSource;
}

/** حالة جلسة تحديث واحدة */
export type UpdateSessionStatus =
  | "idle"
  | "running"
  | "completed"
  | "aborted"
  | "error";

/** إحصائيات جلسة تحديث */
export interface UpdateSessionStats {
  readonly totalReceived: number;
  readonly totalApplied: number;
  readonly totalSkipped: number;
  readonly totalConflicted: number;
  readonly layerStats: ReadonlyMap<AILayerSource, LayerStats>;
}

/** إحصائيات طبقة واحدة */
export interface LayerStats {
  received: number;
  applied: number;
  skipped: number;
}

/** خيارات جلسة التحديث */
export interface ProgressiveUpdateSessionOptions {
  /** الحد الأدنى لثقة التصحيح ليتم تطبيقه */
  readonly minConfidenceThreshold?: number;
  /** هل نسمح لطبقة لاحقة بتعديل تصحيح طبقة سابقة */
  readonly allowLayerOverride?: boolean;
  /** ترتيب أولوية الطبقات (الأعلى أولوية أولاً) */
  readonly layerPriority?: readonly AILayerSource[];
}

// ─── الثوابت ──────────────────────────────────────────────────────

const DEFAULT_MIN_CONFIDENCE = 0.6;

const DEFAULT_LAYER_PRIORITY: readonly AILayerSource[] = [
  "claude-review",
  "gemini-doubt",
  "gemini-context",
];

const progressiveLogger = logger.createScope("progressive-updater");

// ─── خريطة ElementType ↔ ProseMirror node type ───────────────────

/**
 * تحويل ElementType إلى اسم node type في ProseMirror schema.
 * يُرجع null لو النوع غير معروف.
 */
const elementTypeToPmNodeName = (type: ElementType): string | null => {
  switch (type) {
    case "basmala":
      return "basmala";
    case "scene_header_top_line":
      return "scene_header_top_line";
    case "scene_header_1":
      return "scene_header_1";
    case "scene_header_2":
      return "scene_header_2";
    case "scene_header_3":
      return "scene_header_3";
    case "action":
      return "action";
    case "character":
      return "character";
    case "dialogue":
      return "dialogue";
    case "parenthetical":
      return "parenthetical";
    case "transition":
      return "transition";
    default:
      return null;
  }
};

// ─── الفئة الرئيسية ──────────────────────────────────────────────

/**
 * جلسة تحديث تدريجي واحدة — مرتبطة بعملية لصق/فتح واحدة.
 *
 * تتتبع:
 * - التصحيحات المُطبّقة لكل lineIndex
 * - أولوية الطبقات (Claude > Kimi > Gemini)
 * - إحصائيات التحديث
 */
export class ProgressiveUpdateSession {
  private readonly _sessionId: string;
  private readonly _options: Required<ProgressiveUpdateSessionOptions>;
  private _status: UpdateSessionStatus = "idle";

  /** خريطة lineIndex → آخر تصحيح مُطبّق */
  private readonly _appliedCorrections = new Map<number, AICorrectionCommand>();

  /** إحصائيات لكل طبقة */
  private readonly _layerStats = new Map<AILayerSource, LayerStats>();

  private _totalReceived = 0;
  private _totalApplied = 0;
  private _totalSkipped = 0;
  private _totalConflicted = 0;

  constructor(sessionId: string, options?: ProgressiveUpdateSessionOptions) {
    this._sessionId = sessionId;
    this._options = {
      minConfidenceThreshold:
        options?.minConfidenceThreshold ?? DEFAULT_MIN_CONFIDENCE,
      allowLayerOverride: options?.allowLayerOverride ?? true,
      layerPriority: options?.layerPriority ?? DEFAULT_LAYER_PRIORITY,
    };

    // تهيئة إحصائيات الطبقات
    for (const source of this._options.layerPriority) {
      this._layerStats.set(source, { received: 0, applied: 0, skipped: 0 });
    }
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get status(): UpdateSessionStatus {
    return this._status;
  }

  /**
   * تطبيق تصحيح واحد على المحرر.
   *
   * @returns true لو التصحيح اتطبّق، false لو اتخطّى
   */
  applyCorrection(view: EditorView, command: AICorrectionCommand): boolean {
    if (this._status === "aborted" || view.isDestroyed) {
      return false;
    }

    if (this._status === "idle") {
      this._status = "running";
    }

    this._totalReceived += 1;
    const layerStat = this._layerStats.get(command.source);
    if (layerStat) layerStat.received += 1;

    // فحص الثقة
    if (command.confidence < this._options.minConfidenceThreshold) {
      this._totalSkipped += 1;
      if (layerStat) layerStat.skipped += 1;
      progressiveLogger.debug("correction-below-threshold", {
        sessionId: this._sessionId,
        lineIndex: command.lineIndex,
        confidence: command.confidence,
        threshold: this._options.minConfidenceThreshold,
        source: command.source,
      });
      return false;
    }

    // فحص النوع
    if (!isElementType(command.correctedType)) {
      this._totalSkipped += 1;
      if (layerStat) layerStat.skipped += 1;
      return false;
    }

    // فحص تعارض الأولوية
    const existing = this._appliedCorrections.get(command.lineIndex);
    if (existing) {
      if (!this._options.allowLayerOverride) {
        this._totalConflicted += 1;
        if (layerStat) layerStat.skipped += 1;
        return false;
      }

      // فحص أولوية الطبقة
      const existingPriority = this._options.layerPriority.indexOf(
        existing.source
      );
      const newPriority = this._options.layerPriority.indexOf(command.source);

      // أولوية أقل (index أصغر) = أعلى أهمية
      if (
        existingPriority >= 0 &&
        newPriority >= 0 &&
        existingPriority < newPriority
      ) {
        // الطبقة الموجودة أعلى أولوية — تجاهل الجديدة
        this._totalConflicted += 1;
        if (layerStat) layerStat.skipped += 1;
        progressiveLogger.debug("correction-priority-conflict", {
          sessionId: this._sessionId,
          lineIndex: command.lineIndex,
          existingSource: existing.source,
          newSource: command.source,
        });
        return false;
      }
    }

    // تطبيق التصحيح على ProseMirror
    const applied = this._applyToProseMirror(view, command);

    if (applied) {
      this._appliedCorrections.set(command.lineIndex, command);
      this._totalApplied += 1;
      if (layerStat) layerStat.applied += 1;
      progressiveLogger.debug("correction-applied", {
        sessionId: this._sessionId,
        lineIndex: command.lineIndex,
        correctedType: command.correctedType,
        confidence: command.confidence,
        source: command.source,
      });
    } else {
      this._totalSkipped += 1;
      if (layerStat) layerStat.skipped += 1;
    }

    return applied;
  }

  /**
   * تطبيق مجموعة تصحيحات دفعة واحدة (batch).
   *
   * @returns عدد التصحيحات المُطبّقة فعلياً
   */
  applyBatch(
    view: EditorView,
    commands: readonly AICorrectionCommand[]
  ): number {
    let applied = 0;
    for (const command of commands) {
      if (this.applyCorrection(view, command)) {
        applied += 1;
      }
    }
    return applied;
  }

  /**
   * إلغاء الجلسة — لن تقبل تصحيحات جديدة.
   */
  abort(): void {
    this._status = "aborted";
    progressiveLogger.info("session-aborted", {
      sessionId: this._sessionId,
      stats: this.getStats(),
    });
  }

  /**
   * إنهاء الجلسة بنجاح.
   */
  complete(): void {
    this._status = "completed";
    progressiveLogger.info("session-completed", {
      sessionId: this._sessionId,
      stats: this.getStats(),
    });
  }

  /**
   * إرجاع إحصائيات الجلسة.
   */
  getStats(): UpdateSessionStats {
    return {
      totalReceived: this._totalReceived,
      totalApplied: this._totalApplied,
      totalSkipped: this._totalSkipped,
      totalConflicted: this._totalConflicted,
      layerStats: new Map(this._layerStats),
    };
  }

  /**
   * إرجاع التصحيحات المُطبّقة.
   */
  getAppliedCorrections(): ReadonlyMap<number, AICorrectionCommand> {
    return this._appliedCorrections;
  }

  // ─── تطبيق فعلي على ProseMirror ─────────────────────────────

  /**
   * يبحث عن الـ node رقم lineIndex في المستند ويغيّر نوعه.
   *
   * الاستراتيجية:
   * - بنعدّ الـ top-level nodes (children of doc) بترتيب
   * - لو lineIndex أكبر من عدد الـ nodes → skip
   * - لو النوع الحالي = النوع الجديد → skip (no-op)
   * - غير كده → نستبدل الـ node بـ node جديد من نفس النوع الجديد
   */
  private _applyToProseMirror(
    view: EditorView,
    command: AICorrectionCommand
  ): boolean {
    try {
      const { state } = view;
      const doc = state.doc;
      const targetIndex = command.lineIndex;

      // بنجمع مواقع الـ top-level nodes
      let nodeIndex = 0;
      let targetPos = -1;
      let targetNode: PmNode | null = null;

      doc.forEach((node, offset) => {
        if (nodeIndex === targetIndex) {
          targetPos = offset;
          targetNode = node;
        }
        nodeIndex += 1;
      });

      if (targetPos < 0 || !targetNode) {
        progressiveLogger.debug("correction-node-not-found", {
          sessionId: this._sessionId,
          lineIndex: targetIndex,
          totalNodes: nodeIndex,
        });
        return false;
      }

      const pmNodeName = elementTypeToPmNodeName(command.correctedType);
      if (!pmNodeName) return false;

      const newNodeType = state.schema.nodes[pmNodeName];
      if (!newNodeType) return false;

      // لو النوع الحالي هو نفسه → no-op
      if ((targetNode as PmNode).type === newNodeType) {
        pipelineRecorder.logAICorrection({
          lineIndex: command.lineIndex,
          text: (targetNode as PmNode).textContent.slice(0, 50),
          previousType: (targetNode as PmNode).type.name,
          correctedType: command.correctedType,
          confidence: command.confidence,
          source: command.source,
          applied: false,
          reason: "no-op (same type)",
        });
        return false;
      }

      // إنشاء node جديد بنفس المحتوى (مع تصحيح النقطتين)
      let content = (targetNode as PmNode).content;
      const attrs = (targetNode as PmNode).attrs;

      // ── تصحيح النقطتين عند تغيير النوع ──
      const oldTypeName = (targetNode as PmNode).type.name;
      const textContent = (targetNode as PmNode).textContent;

      if (oldTypeName === "character" && pmNodeName !== "character") {
        // خارج من character → شيل النقطتين الختامية
        const cleaned = textContent.replace(/[:：]\s*$/, "");
        if (cleaned !== textContent) {
          content = state.schema.text(cleaned)
            ? Fragment.from(state.schema.text(cleaned))
            : content;
        }
      } else if (oldTypeName !== "character" && pmNodeName === "character") {
        // داخل على character → ضيف نقطتين لو مش موجودة
        if (!/[:：]\s*$/.test(textContent)) {
          const withColon = `${textContent.trimEnd()}:`;
          content = Fragment.from(state.schema.text(withColon));
        }
      }

      const newNode = newNodeType.create(attrs, content);
      const tr = state.tr.replaceWith(
        targetPos,
        targetPos + (targetNode as PmNode).nodeSize,
        newNode
      );

      // meta tag عشان نعرف إن ده تحديث AI مش تعديل مستخدم
      tr.setMeta("ai-progressive-update", {
        source: command.source,
        lineIndex: command.lineIndex,
        correctedType: command.correctedType,
      });

      view.dispatch(tr);

      pipelineRecorder.logAICorrection({
        lineIndex: command.lineIndex,
        text: textContent.slice(0, 50),
        previousType: oldTypeName,
        correctedType: command.correctedType,
        confidence: command.confidence,
        source: command.source,
        applied: true,
        reason: command.reason,
      });

      return true;
    } catch (error) {
      progressiveLogger.error("correction-apply-error", {
        sessionId: this._sessionId,
        lineIndex: command.lineIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// ─── مدير الجلسات ─────────────────────────────────────────────────

/**
 * مدير جلسات التحديث التدريجي.
 *
 * يضمن:
 * - جلسة واحدة نشطة في كل لحظة
 * - إلغاء الجلسة السابقة عند بدء جلسة جديدة
 * - تنظيف الموارد
 */
export class ProgressiveUpdater {
  private _currentSession: ProgressiveUpdateSession | null = null;

  /**
   * إنشاء جلسة تحديث جديدة.
   * لو في جلسة قديمة → بتتلغي تلقائياً.
   */
  createSession(
    sessionId: string,
    options?: ProgressiveUpdateSessionOptions
  ): ProgressiveUpdateSession {
    // إلغاء الجلسة السابقة
    if (this._currentSession && this._currentSession.status === "running") {
      this._currentSession.abort();
    }

    const session = new ProgressiveUpdateSession(sessionId, options);
    this._currentSession = session;

    progressiveLogger.info("session-created", { sessionId });
    return session;
  }

  /**
   * إرجاع الجلسة الحالية (لو موجودة).
   */
  getCurrentSession(): ProgressiveUpdateSession | null {
    return this._currentSession;
  }

  /**
   * إلغاء الجلسة الحالية.
   */
  abortCurrentSession(): void {
    if (this._currentSession && this._currentSession.status === "running") {
      this._currentSession.abort();
    }
    this._currentSession = null;
  }
}

/** singleton instance */
export const progressiveUpdater = new ProgressiveUpdater();
