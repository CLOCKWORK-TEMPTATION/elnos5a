/**
 * @module utils/file-import/plain-text-to-blocks
 * @description غلاف مبسّط حول {@link buildStructuredBlocksFromText}
 * يعيد مصفوفة الكتل مباشرة بدون بقية بيانات الأنبوب الهيكلي.
 */
import type { StructurePipelinePolicy } from "../../types/structure-pipeline";
import type { ScreenplayBlock } from "./document-model";
import { buildStructuredBlocksFromText } from "./structure-pipeline";

/**
 * يحوّل نصاً خاماً إلى مصفوفة كتل سيناريو مصنّفة.
 *
 * @param text - النص الخام المراد تصنيفه
 * @param policy - سياسة الدمج والتصنيف (اختياري)
 * @returns مصفوفة {@link ScreenplayBlock} فقط (بدون metadata)
 */
export const plainTextToScreenplayBlocks = (
  text: string,
  policy?: Partial<StructurePipelinePolicy>
): ScreenplayBlock[] => buildStructuredBlocksFromText(text, policy).blocks;
