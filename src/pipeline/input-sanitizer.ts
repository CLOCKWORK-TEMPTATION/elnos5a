/**
 * @module pipeline/input-sanitizer
 * @description Pipeline 0 — خط أنابيب التنظيف المسبق
 *
 * يكتشف ويزيل تنسيقات غير قياسية من النص المستورد قبل تمريره للمصنف.
 * يعمل كخط أنابيب مستقل تماماً عن طبقات التصنيف الأربع.
 *
 * كل قاعدة تنظيف تُنفَّذ فقط إذا اكتُشف النمط (detection-first).
 *
 * القواعد الحالية:
 * - {@link pstyleBracketPrefix} — بادئات `[pStyle=...]` من Word
 * - {@link xmlArtifactTags} — بقايا Word XML مثل `<w:r>`
 * - {@link wordFieldCodes} — أكواد حقول Word مثل `{HYPERLINK "..."}`
 * - {@link doubleBracketMetadata} — بادئات `[style=...]`, `[class=...]`
 * - {@link zeroWidthClusters} — تجمعات أحرف zero-width (3+)
 */

// ─── الأنواع ─────────────────────────────────────────────────────

/** معرّف فريد لكل قاعدة تنظيف */
export type SanitizationRuleId =
  | "pstyle-bracket-prefix"
  | "xml-artifact-tags"
  | "word-field-codes"
  | "double-bracket-metadata"
  | "zero-width-clusters";

/** واجهة قاعدة تنظيف واحدة */
export interface SanitizationRule {
  readonly id: SanitizationRuleId;
  readonly detect: (text: string) => boolean;
  readonly apply: (text: string) => {
    text: string;
    matchCount: number;
    samples: string[];
  };
}

/** نتيجة تطبيق قاعدة تنظيف واحدة */
export interface SanitizationRuleResult {
  readonly ruleId: SanitizationRuleId;
  readonly applied: boolean;
  readonly matchCount: number;
  readonly sampleMatches: readonly string[];
}

/** تقرير التنظيف الكامل */
export interface SanitizationReport {
  readonly inputLineCount: number;
  readonly outputLineCount: number;
  readonly totalMatchCount: number;
  readonly rulesApplied: readonly SanitizationRuleResult[];
  readonly wasModified: boolean;
  readonly durationMs: number;
}

/** نتيجة التنظيف */
export interface SanitizationResult {
  readonly text: string;
  readonly report: SanitizationReport;
}

// ─── ثوابت ───────────────────────────────────────────────────────

const MAX_SAMPLE_MATCHES = 3;

// ─── القواعد ─────────────────────────────────────────────────────

/**
 * قاعدة 1: بادئات `[pStyle=...]` من تصدير Word
 *
 * يكتشف أنماط مثل `[pStyle=-]`, `[pStyle=Heading1]`, `[pStyle=Normal]`
 * في بداية كل سطر ويحذفها.
 */
const PSTYLE_LINE_RE = /^\[pStyle=[^\]]*\]\s*/;
const PSTYLE_DETECT_RE = /^\[pStyle=[^\]]*\]\s*/m;

const pstyleBracketPrefix: SanitizationRule = {
  id: "pstyle-bracket-prefix",
  detect: (text) => PSTYLE_DETECT_RE.test(text),
  apply: (text) => {
    let matchCount = 0;
    const samples: string[] = [];
    const cleaned = text
      .split("\n")
      .map((line) => {
        const match = line.match(PSTYLE_LINE_RE);
        if (match) {
          matchCount += 1;
          if (samples.length < MAX_SAMPLE_MATCHES) {
            samples.push(match[0].trim());
          }
          return line.replace(PSTYLE_LINE_RE, "");
        }
        return line;
      })
      .join("\n");
    return { text: cleaned, matchCount, samples };
  },
};

/**
 * قاعدة 2: بقايا Word/OOXML XML
 *
 * يكتشف وسوم مثل `<w:r>`, `</w:rPr>`, `<w:t xml:space="preserve">`
 * ويحذفها مع الحفاظ على النص بينها.
 */
const XML_ARTIFACT_RE = /<\/?w:[a-zA-Z]+[^>]*>/g;
const XML_DETECT_RE = /<\/?w:[a-zA-Z]+/;

const xmlArtifactTags: SanitizationRule = {
  id: "xml-artifact-tags",
  detect: (text) => XML_DETECT_RE.test(text),
  apply: (text) => {
    let matchCount = 0;
    const samples: string[] = [];
    const cleaned = text.replace(XML_ARTIFACT_RE, (match) => {
      matchCount += 1;
      if (samples.length < MAX_SAMPLE_MATCHES) samples.push(match);
      return "";
    });
    return { text: cleaned, matchCount, samples };
  },
};

/**
 * قاعدة 3: أكواد حقول Word
 *
 * يكتشف أنماط مثل `{HYPERLINK "..."}`, `{PAGE}`, `{TOC \o "1-3"}`
 * ويحذفها بالكامل.
 */
const WORD_FIELD_RE = /\{[A-Z]+\s[^}]*\}/g;
const WORD_FIELD_DETECT_RE = /\{[A-Z]{3,}\s/;

const wordFieldCodes: SanitizationRule = {
  id: "word-field-codes",
  detect: (text) => WORD_FIELD_DETECT_RE.test(text),
  apply: (text) => {
    let matchCount = 0;
    const samples: string[] = [];
    const cleaned = text.replace(WORD_FIELD_RE, (match) => {
      matchCount += 1;
      if (samples.length < MAX_SAMPLE_MATCHES) samples.push(match);
      return "";
    });
    return { text: cleaned, matchCount, samples };
  },
};

/**
 * قاعدة 4: بادئات metadata عامة بأقواس مربعة
 *
 * يكتشف `[style=...]`, `[class=...]`, `[lang=...]`, `[align=...]`, `[dir=...]`
 * في بداية كل سطر ويحذفها.
 */
const BRACKET_META_LINE_RE = /^\[(?:style|class|lang|align|dir)=[^\]]*\]\s*/;
const BRACKET_META_DETECT_RE = /^\[(?:style|class|lang|align|dir)=[^\]]*\]/m;

const doubleBracketMetadata: SanitizationRule = {
  id: "double-bracket-metadata",
  detect: (text) => BRACKET_META_DETECT_RE.test(text),
  apply: (text) => {
    let matchCount = 0;
    const samples: string[] = [];
    const cleaned = text
      .split("\n")
      .map((line) => {
        const match = line.match(BRACKET_META_LINE_RE);
        if (match) {
          matchCount += 1;
          if (samples.length < MAX_SAMPLE_MATCHES) {
            samples.push(match[0].trim());
          }
          return line.replace(BRACKET_META_LINE_RE, "");
        }
        return line;
      })
      .join("\n");
    return { text: cleaned, matchCount, samples };
  },
};

/**
 * قاعدة 5: تجمعات أحرف zero-width
 *
 * يكتشف 3+ أحرف zero-width متتالية (ZWSP, ZWNJ, ZWJ, LRM, RLM, ALM, BOM)
 * ويحذفها. لا يمس الأحرف المفردة (قد تكون مقصودة لتوجيه النص).
 */
const ZERO_WIDTH_CLUSTER_RE = /[\u200B-\u200F\u061C\uFEFF]{3,}/g;
const ZERO_WIDTH_CLUSTER_DETECT_RE = /[\u200B-\u200F\u061C\uFEFF]{3,}/;

const zeroWidthClusters: SanitizationRule = {
  id: "zero-width-clusters",
  detect: (text) => ZERO_WIDTH_CLUSTER_DETECT_RE.test(text),
  apply: (text) => {
    let matchCount = 0;
    const samples: string[] = [];
    const cleaned = text.replace(ZERO_WIDTH_CLUSTER_RE, (match) => {
      matchCount += 1;
      if (samples.length < MAX_SAMPLE_MATCHES) {
        samples.push(`[${match.length} zero-width chars]`);
      }
      return "";
    });
    return { text: cleaned, matchCount, samples };
  },
};

// ─── سجل القواعد ─────────────────────────────────────────────────

const SANITIZATION_RULES: readonly SanitizationRule[] = [
  pstyleBracketPrefix,
  xmlArtifactTags,
  wordFieldCodes,
  doubleBracketMetadata,
  zeroWidthClusters,
];

// ─── الدوال المصدّرة ─────────────────────────────────────────────

/**
 * يُنفّذ خط أنابيب التنظيف على النص.
 * كل قاعدة تُنفَّذ فقط إذا اكتُشف النمط (detection-first).
 *
 * @param text - النص الخام قبل التصنيف
 * @returns نتيجة التنظيف مع تقرير مفصل
 */
export function sanitizeInput(text: string): SanitizationResult {
  const startTime = performance.now();
  const inputLineCount = text.split("\n").length;

  let currentText = text;
  const ruleResults: SanitizationRuleResult[] = [];
  let totalMatchCount = 0;

  for (const rule of SANITIZATION_RULES) {
    if (!rule.detect(currentText)) {
      ruleResults.push({
        ruleId: rule.id,
        applied: false,
        matchCount: 0,
        sampleMatches: [],
      });
      continue;
    }

    const result = rule.apply(currentText);
    currentText = result.text;
    totalMatchCount += result.matchCount;
    ruleResults.push({
      ruleId: rule.id,
      applied: true,
      matchCount: result.matchCount,
      sampleMatches: result.samples,
    });
  }

  const outputLineCount = currentText.split("\n").length;
  const durationMs = performance.now() - startTime;

  return {
    text: currentText,
    report: {
      inputLineCount,
      outputLineCount,
      totalMatchCount,
      rulesApplied: ruleResults,
      wasModified: currentText !== text,
      durationMs,
    },
  };
}

/**
 * يتحقق مما إذا كان النص يحتاج تنظيفاً (كشف سريع بدون تعديل).
 */
export function needsSanitization(text: string): boolean {
  return SANITIZATION_RULES.some((rule) => rule.detect(text));
}
