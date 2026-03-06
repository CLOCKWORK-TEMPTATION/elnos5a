import type { UnstructuredResult, UnstructuredItemType } from "./types";

export interface UnstructuredValidationError {
  code: string;
  message: string;
  itemIndex?: number;
}

export interface UnstructuredValidationResult {
  ok: boolean;
  errors: UnstructuredValidationError[];
}

const ELEMENTS: UnstructuredItemType[] = [
  "BASMALA",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "ACTION",
  "CHARACTER",
  "DIALOGUE",
  "TRANSITION",
];

const ELEMENT_SET = new Set(ELEMENTS);

const DIALOGUE_SPEAKER_PREFIX_RE = /^\s*[^:：]{1,60}\s*[：:]\s*/u;

export function validateUnstructuredResult(
  result: UnstructuredResult
): UnstructuredValidationResult {
  const errors: UnstructuredValidationError[] = [];

  if (!result || result.version !== "unstructured-v1") {
    return {
      ok: false,
      errors: [
        {
          code: "INVALID_VERSION",
          message: "version يجب أن تكون unstructured-v1.",
        },
      ],
    };
  }

  if (!Array.isArray(result.items) || result.items.length === 0) {
    return {
      ok: false,
      errors: [{ code: "MISSING_ITEMS", message: "items[] مفقودة أو فارغة." }],
    };
  }

  for (let k = 0; k < result.items.length; k++) {
    const it = result.items[k];
    const expected = k + 1;

    if (it.i !== expected) {
      errors.push({
        code: "INVALID_INDEX",
        message: "i يجب أن يكون تسلسليًا يبدأ من 1 بدون فجوات.",
        itemIndex: it.i,
      });
    }

    if (!ELEMENT_SET.has(it.type)) {
      errors.push({
        code: "UNKNOWN_ELEMENT",
        message: `type غير معتمد: ${String(it.type)}`,
        itemIndex: it.i,
      });
    }

    if (typeof it.raw !== "string" || typeof it.normalized !== "string") {
      errors.push({
        code: "INVALID_TEXT",
        message: "raw/normalized يجب أن يكونا نصوصًا.",
        itemIndex: it.i,
      });
      continue;
    }

    if (it.raw.trim() === "" || it.normalized.trim() === "") {
      errors.push({
        code: "EMPTY_TEXT",
        message: "ممنوع raw/normalized فارغ.",
        itemIndex: it.i,
      });
    }

    if (it.type === "CHARACTER") {
      if (!it.normalized.trim().endsWith(":")) {
        errors.push({
          code: "CHARACTER_MISSING_COLON",
          message: "CHARACTER.normalized يجب أن ينتهي بـ ':'",
          itemIndex: it.i,
        });
      }
    }

    if (it.type === "DIALOGUE") {
      const normalized = it.normalized.trim();
      if (DIALOGUE_SPEAKER_PREFIX_RE.test(normalized)) {
        errors.push({
          code: "DIALOGUE_CONTAINS_SPEAKER_PREFIX",
          message:
            "DIALOGUE يحتوي بادئة متكلم (اسم :)—يجب فصل CHARACTER كسطر مستقل.",
          itemIndex: it.i,
        });
      }

      if (/(---+|End of Extraction|هل ترغب|والباقي)/iu.test(normalized)) {
        errors.push({
          code: "LEAKED_META_TEXT",
          message: "تم رصد نصوص ميتا/فواصل داخل normalized.",
          itemIndex: it.i,
        });
      }
    }

    if (/(---+|End of Extraction|هل ترغب|والباقي)/iu.test(it.normalized)) {
      errors.push({
        code: "LEAKED_META_TEXT",
        message: "تم رصد نصوص ميتا/فواصل داخل normalized.",
        itemIndex: it.i,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertUnstructuredValid(v: UnstructuredValidationResult): void {
  if (!v.ok) {
    const msg =
      "Unstructured validation failed:\n" +
      v.errors
        .map((e) => `- [${e.code}] i=${e.itemIndex ?? "?"} ${e.message}`)
        .join("\n");
    throw new Error(msg);
  }
}
