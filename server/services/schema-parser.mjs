/**
 * @description parser لصيغة ELEMENT = VALUE من ناتج المحرك
 * يحوّل أسطر schema إلى مصفوفة عناصر مع validation صارم
 */

/**
 * جدول ربط أسماء عناصر المحرك بأنواع عناصر السيناريو
 */
const ENGINE_ELEMENT_MAP = new Map([
  ["SCENE-HEADER-1", "scene_header_1"],
  ["SCENE-HEADER-2", "scene_header_2"],
  ["SCENE-HEADER-3", "scene_header_3"],
  ["ACTION", "action"],
  ["DIALOGUE", "dialogue"],
  ["CHARACTER", "character"],
  ["TRANSITION", "transition"],
  ["PARENTHETICAL", "parenthetical"],
  ["BASMALA", "basmala"],
]);

/**
 * تحويل اسم عنصر المحرك إلى ElementType
 * @param {string} engineElement - اسم العنصر من المحرك (مثل "cene_header_1")
 * @returns {string|null} ElementType أو null إذا كان غير معروف
 */
export const mapEngineElement = (engineElement) => {
  if (typeof engineElement !== "string") return null;
  return ENGINE_ELEMENT_MAP.get(engineElement.trim()) ?? null;
};

/**
 * تحليل سطر schema واحد بصيغة "ELEMENT = VALUE"
 * @param {string} line - سطر واحد
 * @returns {{ element: string, value: string } | null}
 */
const parseSchemaLine = (line) => {
  if (typeof line !== "string") return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  const eqIndex = trimmed.indexOf(" = ");
  if (eqIndex === -1) return null;

  const element = trimmed.slice(0, eqIndex).trim();
  const value = trimmed.slice(eqIndex + 3).trim();

  if (!element || !value) return null;

  return { element, value };
};

/**
 * تحليل نص schema كامل إلى مصفوفة عناصر مع validation
 * @param {string} schemaText - النص المهيكل بصيغة "ELEMENT = VALUE\n..."
 * @returns {{ elements: Array<{ element: string, value: string, mappedType: string }>, warnings: string[] }}
 */
export const parseSchemaText = (schemaText) => {
  const warnings = [];
  const elements = [];

  if (typeof schemaText !== "string" || !schemaText.trim()) {
    return { elements, warnings: ["Empty or invalid schema text"] };
  }

  const lines = schemaText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseSchemaLine(lines[i]);
    if (!parsed) continue;

    const mappedType = mapEngineElement(parsed.element);
    if (!mappedType) {
      warnings.push(
        `سطر ${i + 1}: عنصر غير معروف "${parsed.element}" — تم تجاهله`
      );
      continue;
    }

    elements.push({
      element: parsed.element,
      value: parsed.value,
      mappedType,
    });
  }

  // orphan cene_header_1 handling: تحذير عند وجود scene_header_1 بدون scene_header_2 بعده
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].mappedType === "scene_header_1") {
      const next = elements[i + 1];
      if (!next || next.mappedType !== "scene_header_2") {
        warnings.push(`سطر: SCENE-HEADER-1 بدون SCENE-HEADER-2 تالٍ`);
      }
    }
  }

  return { elements, warnings };
};

/**
 * تحويل schemaElements من المحرك إلى ClassifiedDraft-like objects
 * @param {Array<{ element: string, value: string }>} schemaElements
 * @returns {{ drafts: Array<{ type: string, text: string, confidence: number, classificationMethod: string }>, warnings: string[] }}
 */
export const schemaElementsToDrafts = (schemaElements) => {
  const warnings = [];
  const drafts = [];

  if (!Array.isArray(schemaElements)) {
    return { drafts, warnings: ["schemaElements is not an array"] };
  }

  for (let i = 0; i < schemaElements.length; i++) {
    const el = schemaElements[i];
    if (!el || typeof el.element !== "string" || typeof el.value !== "string") {
      warnings.push(`عنصر ${i}: بيانات غير صالحة — تم تجاهله`);
      continue;
    }

    const mappedType = mapEngineElement(el.element);
    if (!mappedType) {
      warnings.push(`عنصر ${i}: "${el.element}" غير معروف — تم تجاهله`);
      continue;
    }

    drafts.push({
      type: mappedType,
      text: el.value,
      confidence: 1.0,
      classificationMethod: "external-engine",
    });
  }

  // orphan cene_header_1 check
  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i].type === "scene_header_1") {
      const next = drafts[i + 1];
      if (!next || next.type !== "scene_header_2") {
        warnings.push(
          `cene_header_1 بدون cene_header_2 تالٍ — scene_header_1 جزئي`
        );
      }
    }
  }

  return { drafts, warnings };
};
