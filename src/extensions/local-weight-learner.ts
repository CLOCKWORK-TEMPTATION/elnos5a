/**
 * @module extensions/local-weight-learner
 * @description
 * معايرة خفيفة للأوزان — تتعلم من تصحيحات المستخدم في نفس الجلسة.
 *
 * مش RL كامل — مجرد deltas تُضاف على الأوزان الثابتة:
 * - لو المستخدم صحّح dialogue → action مرتين → الـ action evidence بيزيد وزنها
 * - لو المستخدم صحّح action → dialogue → الـ dialogue cues بتزيد وزنها
 *
 * الأوزان بتنتهي مع الجلسة (مفيش persistence — الجلسة الجاية بتبدأ من الصفر).
 *
 * يُصدّر:
 * - {@link WeightDeltas} — الـ deltas الحالية
 * - {@link LocalWeightLearner} — الفئة الرئيسية
 *
 * يُستهلك في: paste-classifier (عند التصنيف) + EditorArea (عند تصحيح المستخدم).
 */

import { logger } from "../utils/logger";
import type { ElementType } from "./classification-types";

const learnerLogger = logger.createScope("weight-learner");

// ─── الأنواع ──────────────────────────────────────────────────────

/** الـ deltas اللي بتنطبق على الأوزان الثابتة */
export interface WeightDeltas {
  /** bonus/penalty لـ action evidence score */
  readonly actionEvidenceBonus: number;
  /** bonus/penalty لـ dialogue evidence score */
  readonly dialogueEvidenceBonus: number;
  /** bonus/penalty لـ context weight (recency) */
  readonly contextRecencyBonus: number;
  /** عدد التصحيحات اللي اتعلمنا منها */
  readonly correctionCount: number;
}

/** تصحيح مستخدم واحد */
export interface UserCorrection {
  readonly lineText: string;
  readonly fromType: ElementType;
  readonly toType: ElementType;
  readonly lineIndex: number;
}

// ─── ثوابت ─────────────────────────────────────────────────────────

/** أقصى delta مسموح (عشان ما يطغاش على الأوزان الأصلية) */
const MAX_DELTA = 3.0;

/** حجم خطوة التعلم */
const LEARNING_RATE = 0.5;

/** أقل عدد تصحيحات عشان الـ deltas تبدأ تأثر */
const MIN_CORRECTIONS_TO_ACTIVATE = 2;

// ─── الفئة الرئيسية ──────────────────────────────────────────────

export class LocalWeightLearner {
  private _actionBonus = 0;
  private _dialogueBonus = 0;
  private _contextBonus = 0;
  private _correctionCount = 0;

  /**
   * تسجيل تصحيح مستخدم — يحدّث الـ deltas.
   *
   * @param correction - التصحيح (من أي نوع → لأي نوع)
   */
  recordCorrection(correction: UserCorrection): void {
    const { fromType, toType } = correction;

    // تصحيح dialogue → action: الـ action evidence كان لازم يكون أقوى
    if (fromType === "dialogue" && toType === "action") {
      this._actionBonus = clamp(
        this._actionBonus + LEARNING_RATE,
        -MAX_DELTA,
        MAX_DELTA
      );
      this._dialogueBonus = clamp(
        this._dialogueBonus - LEARNING_RATE * 0.5,
        -MAX_DELTA,
        MAX_DELTA
      );
    }

    // تصحيح action → dialogue: الـ dialogue cues كان لازم تكون أقوى
    if (fromType === "action" && toType === "dialogue") {
      this._dialogueBonus = clamp(
        this._dialogueBonus + LEARNING_RATE,
        -MAX_DELTA,
        MAX_DELTA
      );
      this._actionBonus = clamp(
        this._actionBonus - LEARNING_RATE * 0.5,
        -MAX_DELTA,
        MAX_DELTA
      );
    }

    // تصحيح action/dialogue → character: الـ context كان لازم يكون أقوى
    if (
      toType === "character" &&
      (fromType === "action" || fromType === "dialogue")
    ) {
      this._contextBonus = clamp(
        this._contextBonus + LEARNING_RATE * 0.3,
        -MAX_DELTA,
        MAX_DELTA
      );
    }

    // تصحيح character → action/dialogue: الـ context كان مضلل
    if (
      fromType === "character" &&
      (toType === "action" || toType === "dialogue")
    ) {
      this._contextBonus = clamp(
        this._contextBonus - LEARNING_RATE * 0.3,
        -MAX_DELTA,
        MAX_DELTA
      );
    }

    this._correctionCount++;

    learnerLogger.info("correction-recorded", {
      fromType,
      toType,
      actionBonus: this._actionBonus.toFixed(2),
      dialogueBonus: this._dialogueBonus.toFixed(2),
      contextBonus: this._contextBonus.toFixed(2),
      totalCorrections: this._correctionCount,
    });
  }

  /**
   * الـ deltas الحالية — بتتطبق على أوزان التصنيف.
   *
   * بترجع أصفار لو عدد التصحيحات < الحد الأدنى (عشان تصحيح واحد ما يأثرش).
   */
  getDeltas(): WeightDeltas {
    if (this._correctionCount < MIN_CORRECTIONS_TO_ACTIVATE) {
      return {
        actionEvidenceBonus: 0,
        dialogueEvidenceBonus: 0,
        contextRecencyBonus: 0,
        correctionCount: this._correctionCount,
      };
    }

    return {
      actionEvidenceBonus: this._actionBonus,
      dialogueEvidenceBonus: this._dialogueBonus,
      contextRecencyBonus: this._contextBonus,
      correctionCount: this._correctionCount,
    };
  }

  /** إعادة تعيين الأوزان (بداية جلسة جديدة) */
  reset(): void {
    this._actionBonus = 0;
    this._dialogueBonus = 0;
    this._contextBonus = 0;
    this._correctionCount = 0;
  }
}

// ─── أداة مساعدة ──────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
