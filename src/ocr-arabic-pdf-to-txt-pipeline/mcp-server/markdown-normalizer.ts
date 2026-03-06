/**
 * @description محرك تطبيع Markdown للنصوص العربية المستخرجة من OCR
 */

import type { NormalizationOptions } from "./types.js";
import { ensureTrailingNewline } from "./text-helpers.js";

export class MarkdownNormalizer {
  private readonly noiseOnlyLine = /^[\s\-•▪*·.]+$/u;
  private readonly bulletPrefixPattern =
    /^[\s\u200E\u200F\u061C\uFEFF]*[•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃*+]/u;
  private readonly invisibleCharsPattern = /[\u200f\u200e\ufeff\u061c]/gu;
  private readonly htmlTagPattern = /<[^>]+>/gu;
  private readonly domArtifactTokenPattern = /@dom-element:[^\s]+/giu;
  private readonly headingNumberPattern = /^(#{1,6})\s*(\d+)\s*$/u;
  private readonly sceneHeadingPattern = /^(#{1,6})\s*(مشهد)\s*$/u;
  private readonly arabicDiacritics = /[\u064b-\u065f\u0670]/gu;
  private readonly nonWordPattern = /[^\w\u0600-\u06FF\s]/gu;
  private readonly whitespacePattern = /\s+/gu;
  private readonly sentenceEndPattern = /[.!؟?!…»"]\s*$/u;
  private readonly continuationPrefixRe = /^(?:\.{3}|…|،|(?:و|ثم)\s+)/u;

  private readonly sceneNumberExactRe = /^\s*(?:مشهد|scene)\s*[0-9٠-٩]+/iu;
  private readonly sceneTimeRe = /(نهار|ليل|صباح|مساء|فجر)/iu;
  private readonly sceneLocationRe = /(داخلي|خارجي)/iu;
  private readonly transitionRe =
    /^(?:قطع|اختفاء|تحول|انتقال|fade|cut|dissolve|wipe)(?:\s+(?:إلى|to))?[:\s]*$/iu;
  private readonly characterRe =
    /^\s*(?:صوت\s+)?[\u0600-\u06FF][\u0600-\u06FF\s0-9٠-٩]{0,30}:?\s*$/u;
  private readonly parentheticalRe = /^[\(（].*?[\)）]$/u;
  private readonly inlineDialogueGlueRe =
    /^([\u0600-\u06FF]+(?:اً))([\u0600-\u06FF][\u0600-\u06FF\s]{0,20}?)\s*[:：]\s*(.+)$/u;
  private readonly inlineDialogueRe = /^([^:：]{1,60}?)\s*[:：]\s*(.+)$/u;
  private readonly arabicOnlyWithNumbersRe =
    /^[\s\u0600-\u06FF\d٠-٩\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+$/u;
  private readonly basmalaBasmRe = /بسم/iu;
  private readonly basmalaAllahRe = /الله/iu;
  private readonly basmalaRahmanRe = /الرحمن/iu;
  private readonly basmalaRahimRe = /الرحيم/iu;

  private readonly headerKeywords = new Set([
    "بسم الله",
    "مشهد",
    "الصالة",
    "نهار",
    "- داخلي",
  ]);
  private readonly sceneMetadata = new Set([
    "قطع",
    "### قطع",
    "## قطع",
    "# قطع",
    "- قطع",
  ]);

  private readonly options: Required<NormalizationOptions>;

  constructor(options: NormalizationOptions = {}) {
    this.options = {
      normalizeYa: options.normalizeYa ?? false,
      normalizeTaMarbuta: options.normalizeTaMarbuta ?? false,
      normalizeHamza: options.normalizeHamza ?? true,
      normalizeDigits: options.normalizeDigits ?? "arabic",
      removeDiacritics: options.removeDiacritics ?? true,
      fixConnectedLetters: options.fixConnectedLetters ?? true,
      fixArabicPunctuation: options.fixArabicPunctuation ?? true,
      scriptSpecificRules: options.scriptSpecificRules ?? true,
    };
  }

  private normalizeArabicCharacters(text: string): string {
    let result = text;
    if (this.options.normalizeYa) {
      result = result.replace(/ى/g, "ي");
    }
    if (this.options.normalizeTaMarbuta) {
      result = result.replace(/ة/g, "ه");
    }
    return result;
  }

  private normalizeHamzaChars(text: string): string {
    if (!this.options.normalizeHamza) return text;
    let result = text;
    result = result.replace(/[إأآ]/g, "ا");
    result = result.replace(/ؤ/g, "و");
    return result;
  }

  private normalizeDigitsChars(text: string): string {
    const mode = this.options.normalizeDigits;
    if (mode === "none") return text;

    let result = text;
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
    const westernDigits = "0123456789";

    if (mode === "arabic") {
      for (let i = 0; i < 10; i++) {
        result = result.replace(
          new RegExp(westernDigits[i], "g"),
          arabicDigits[i]
        );
        result = result.replace(
          new RegExp(persianDigits[i], "g"),
          arabicDigits[i]
        );
      }
    } else if (mode === "western") {
      for (let i = 0; i < 10; i++) {
        result = result.replace(
          new RegExp(arabicDigits[i], "g"),
          westernDigits[i]
        );
        result = result.replace(
          new RegExp(persianDigits[i], "g"),
          westernDigits[i]
        );
      }
    }

    return result;
  }

  private fixConnectedLettersChars(text: string): string {
    if (!this.options.fixConnectedLetters) return text;
    let result = text;
    result = result.replace(/[\uFEED\uFEEE\uFEE9\uFEEA]/g, "و");
    result = result.replace(/[\uFED1\uFED2\uFED3\uFED4]/g, "ف");
    result = result.replace(/[\uFE91\uFE92\uFE8F\uFE90]/g, "ب");
    result = result.replace(/[\uFE97\uFE98\uFE95\uFE96]/g, "ت");
    return result;
  }

  private fixArabicPunctuationChars(text: string): string {
    if (!this.options.fixArabicPunctuation) return text;
    let result = text;
    result = result.replace(/،(?!\s)/g, "، ");
    result = result.replace(/,(?!\s)/g, ", ");
    result = result.replace(/\s+،/g, "،");
    result = result.replace(/\s+,/g, ",");
    result = result.replace(/\.(?!\s|\.)/g, ". ");
    result = result.replace(/\s*([؟?!])\s*/g, " $1 ");
    result = result.replace(/\s{2,}/g, " ");
    return result;
  }

  normalize(text: string): string {
    const unicode = this.normalizeUnicode(text);
    const fixedLetters = this.fixConnectedLettersChars(unicode);
    const normalizedChars = this.normalizeArabicCharacters(fixedLetters);
    const normalizedHamza = this.normalizeHamzaChars(normalizedChars);
    const normalizedDigits = this.normalizeDigitsChars(normalizedHamza);

    let lines = this.normalizeLines(normalizedDigits);
    lines = lines.map((line) => this.normalizeStructuralLine(line));

    if (this.options.scriptSpecificRules) {
      lines = this.filterSceneMetadata(lines);
    }

    if (this.options.scriptSpecificRules) {
      lines = lines.map((line) => this.normalizeSpeakerLine(line));
    }

    lines = this.normalizeBullets(lines);

    if (this.options.scriptSpecificRules) {
      lines = this.mergeSplitHeadings(lines);
    }

    lines = this.mergeWrappedLines(lines);
    lines = this.collapseBlankLines(lines);

    let finalText = lines.join("\n").trim();
    finalText = this.fixArabicPunctuationChars(finalText);

    return ensureTrailingNewline(finalText);
  }

  normalizeForMatch(text: string): string {
    let out = text.trim().toLowerCase();
    out = out.replace(this.arabicDiacritics, "");
    out = out.replace(this.nonWordPattern, " ");
    out = out.replace(this.whitespacePattern, " ").trim();
    return out;
  }

  private filterSceneMetadata(lines: string[]): string[] {
    const out: string[] = [];
    for (const line of lines) {
      const s = line.trim();
      if (this.sceneMetadata.has(s)) {
        continue;
      }
      if (this.transitionRe.test(s)) {
        continue;
      }
      out.push(line);
    }
    return out;
  }

  private normalizeUnicode(text: string): string {
    let out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    out = out.replace(/\ufeff/g, "");
    out = out.replace(/\xa0/g, " ");
    out = out.replace(/[–—−]/g, "-");
    out = out.replace(/…/g, "...");

    const chars: string[] = [];
    for (const ch of out) {
      if (ch === "\n" || ch === "\t") {
        chars.push(ch);
        continue;
      }
      const cp = ch.codePointAt(0) ?? 0;
      const control = (cp >= 0 && cp <= 31) || (cp >= 127 && cp <= 159);
      if (!control) {
        chars.push(ch);
      }
    }

    return chars.join("").replace(this.invisibleCharsPattern, "");
  }

  private normalizeLines(text: string): string[] {
    const out: string[] = [];

    for (const raw of text.split("\n")) {
      let line = raw.replace(/\t/g, " ");
      line = line.replace(this.domArtifactTokenPattern, " ");
      line = line.replace(this.htmlTagPattern, " ");
      line = line.trim();
      line = line.replace(/\\-/g, "-");
      line = line.replace(/\*\*/g, "").replace(/__/g, "");
      line = line.replace(this.invisibleCharsPattern, "");

      if (line && this.noiseOnlyLine.test(line)) {
        continue;
      }

      line = this.normalizeLinePrefix(line);
      line = line.replace(this.whitespacePattern, " ").trim();
      out.push(line);
    }

    return out;
  }

  private normalizeLinePrefix(line: string): string {
    let out = line;
    out = out.replace(/^\*\s+/u, "- ");
    out = out.replace(/^-\s*-+\s*/u, "- ");
    out = out.replace(/^-\s*:\s*/u, "- ");
    out = out.replace(/^-\s*\.\.\s*/u, "- ");
    return out;
  }

  private normalizeStructuralLine(line: string): string {
    const stripped = line.trim();
    if (!stripped) {
      return "";
    }

    const compactArabic = stripped.replace(/[^\u0600-\u06FF\s]/gu, "");
    const hasBasm = this.basmalaBasmRe.test(compactArabic);
    const hasAllah = this.basmalaAllahRe.test(compactArabic);
    const hasRahman = this.basmalaRahmanRe.test(compactArabic);
    const hasRahim = this.basmalaRahimRe.test(compactArabic);

    if (hasBasm && hasAllah && (hasRahman || hasRahim)) {
      return "بسم الله الرحمن الرحيم";
    }

    const glueMatch = stripped.match(this.inlineDialogueGlueRe);
    if (glueMatch) {
      const speaker = `${glueMatch[1]} ${glueMatch[2]}`
        .replace(this.whitespacePattern, " ")
        .trim();
      const dialogue = glueMatch[3].replace(this.whitespacePattern, " ").trim();
      if (speaker && dialogue && this.characterRe.test(`${speaker}:`)) {
        return `${speaker}: ${dialogue}`;
      }
    }

    const inline = stripped.match(this.inlineDialogueRe);
    if (inline) {
      const speaker = inline[1].replace(this.whitespacePattern, " ").trim();
      const dialogue = inline[2].replace(this.whitespacePattern, " ").trim();
      if (
        speaker &&
        dialogue &&
        this.arabicOnlyWithNumbersRe.test(speaker) &&
        this.characterRe.test(`${speaker}:`)
      ) {
        return `${speaker}: ${dialogue}`;
      }
    }

    if (this.transitionRe.test(stripped)) {
      return stripped.replace(/[:：]+\s*$/u, "").trim();
    }

    return stripped;
  }

  private isHeading(line: string): boolean {
    return line.startsWith("#");
  }

  private isBullet(line: string): boolean {
    return line.startsWith("- ") || line.startsWith("* ");
  }

  private isSceneHeaderCandidate(line: string): boolean {
    const normalized = line
      .replace(/-/g, " ")
      .replace(this.whitespacePattern, " ")
      .trim();
    if (!normalized) {
      return false;
    }
    if (this.sceneNumberExactRe.test(normalized)) {
      return true;
    }
    return (
      this.sceneTimeRe.test(normalized) && this.sceneLocationRe.test(normalized)
    );
  }

  private isStructuralBoundary(line: string): boolean {
    const s = line.trim();
    if (!s) {
      return true;
    }
    if (this.isHeading(s) || this.isBullet(s)) {
      return true;
    }
    if (this.transitionRe.test(s) || this.isSceneHeaderCandidate(s)) {
      return true;
    }
    if (this.parentheticalRe.test(s) || this.characterRe.test(s)) {
      return true;
    }
    if (s.startsWith("بسم الله")) {
      return true;
    }
    return false;
  }

  private mergeSplitHeadings(lines: string[]): string[] {
    const merged: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const scene = line.match(this.sceneHeadingPattern);

      if (scene) {
        let j = i + 1;
        while (j < lines.length && !lines[j]) {
          j += 1;
        }
        if (j < lines.length) {
          const num = lines[j].match(this.headingNumberPattern);
          if (num) {
            merged.push(`${scene[1]} ${scene[2]} ${num[2]}`);
            i = j + 1;
            continue;
          }
        }
      }

      merged.push(line);
      i += 1;
    }

    return merged;
  }

  private normalizeSpeakerLine(line: string): string {
    let out = line;
    out = out.replace(/\s*:\s+/gu, ": ");
    out = out.replace(/\s*\.\s*\./gu, "..");
    return out;
  }

  private normalizeBullets(lines: string[]): string[] {
    const out: string[] = [];
    for (const line of lines) {
      if (!line.startsWith("- ") && !this.bulletPrefixPattern.test(line)) {
        out.push(line);
        continue;
      }
      const stripped = line
        .replace(/^[\-*•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃+\s]+/u, "")
        .trim();
      out.push(`- ${stripped}`);
    }
    return out;
  }

  private mergeWrappedLines(lines: string[]): string[] {
    const merged: string[] = [];

    for (const line of lines) {
      if (!line) {
        merged.push(line);
        continue;
      }
      if (merged.length === 0) {
        merged.push(line);
        continue;
      }

      const prev = merged[merged.length - 1];
      if (this.continuationPrefixRe.test(line)) {
        merged[merged.length - 1] = `${prev.trimEnd()} ${line.trimStart()}`;
        continue;
      }

      const isHeaderLine = [...this.headerKeywords].some((kw) =>
        line.includes(kw)
      );
      const isPrevHeader = [...this.headerKeywords].some((kw) =>
        prev.includes(kw)
      );
      const isStructuralLine = this.isStructuralBoundary(line);
      const isPrevStructural = this.isStructuralBoundary(prev);
      const prevEndsSentence = this.sentenceEndPattern.test(prev);

      const shouldMerge =
        line &&
        !this.isHeading(line) &&
        !this.isBullet(line) &&
        !isHeaderLine &&
        !isStructuralLine &&
        prev &&
        !this.isHeading(prev) &&
        !isPrevHeader &&
        !isPrevStructural &&
        !prevEndsSentence;

      if (shouldMerge) {
        merged[merged.length - 1] = `${prev.trimEnd()} ${line.trimStart()}`;
      } else {
        merged.push(line);
      }
    }

    return merged;
  }

  private collapseBlankLines(lines: string[]): string[] {
    const out: string[] = [];
    let prevBlank = false;
    for (const line of lines) {
      const blank = !line;
      if (blank && prevBlank) {
        continue;
      }
      out.push(line);
      prevBlank = blank;
    }
    return out;
  }
}
