/**
 * @module extensions/context-memory-manager
 * @description
 * مدير ذاكرة السياق — ذاكرة خفيفة تعمل داخل جلسة تصنيف واحدة (عملية لصق).
 *
 * يُصدّر:
 * - {@link ContextMemorySnapshot} — لقطة للقراءة فقط من حالة الذاكرة
 * - {@link ContextMemoryManager} — الفئة الرئيسية لتسجيل واسترجاع السياق
 *
 * لا يعتمد على React أو Backend — يعمل بالكامل في الذاكرة المحلية.
 * يُستهلك في {@link PasteClassifier} و {@link HybridClassifier}.
 */
import type { ClassifiedDraft, ElementType } from "./classification-types";
import {
  parseInlineCharacterDialogue,
  isCandidateCharacterName,
} from "./character";
import { normalizeCharacterName, isActionVerbStart } from "./text-utils";
import { loadFromStorage, saveToStorage } from "../hooks/use-local-storage";
import { logger } from "../utils/logger";
import { pipelineRecorder } from "./pipeline-recorder";

export interface DialogueBlock {
  character: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

export interface LineRelation {
  previousLine: string;
  currentLine: string;
  relationType: "follows" | "precedes" | "interrupts";
}

export interface ClassificationRecord {
  line: string;
  classification: ElementType;
}

export interface ContextMemory {
  sessionId: string;
  lastModified?: number;
  data: {
    commonCharacters: string[];
    commonLocations: string[];
    lastClassifications: ElementType[];
    characterDialogueMap: Record<string, number>;
  };
}

export interface Correction {
  line: string;
  originalClassification: string;
  newClassification: string;
  timestamp: number;
}

export interface EnhancedContextMemory extends ContextMemory {
  data: ContextMemory["data"] & {
    dialogueBlocks: DialogueBlock[];
    lineRelationships: LineRelation[];
    userCorrections: Correction[];
    confidenceMap: Record<string, number>;
  };
}

export interface ContextMemorySnapshot {
  readonly recentTypes: readonly ElementType[];
  readonly characterFrequency: ReadonlyMap<string, number>;
  readonly confirmedCharacters: ReadonlySet<string>;
  readonly characterEvidence: ReadonlyMap<string, CharacterEvidence>;
  readonly isInDialogueFlow: boolean;
  readonly lastCharacterName: string | null;
  readonly dialogueDepth: number;
}

/** أدلة تأكيد هوية الشخصية — كل عدّاد مستقل */
export interface CharacterEvidence {
  /** عدد مرات الظهور كـ inline pair (اسم: حوار في سطر واحد) */
  inlinePairCount: number;
  /** عدد مرات الظهور كـ standalone header (اسم: في سطر مستقل) */
  standaloneHeaderCount: number;
  /** عدد المرات اللي السطر التالي كان حوار */
  dialogueFollowerCount: number;
  /** عدد التكرارات الكلية */
  repeatCount: number;
  /** عدد مرات ظهور action contamination (الاسم ظهر في سياق فعل) */
  actionContaminationCount: number;
}

const createEmptyEvidence = (): CharacterEvidence => ({
  inlinePairCount: 0,
  standaloneHeaderCount: 0,
  dialogueFollowerCount: 0,
  repeatCount: 0,
  actionContaminationCount: 0,
});

/**
 * سياسة التأكيد — متى يُعتبر الاسم مؤكد كشخصية؟
 * مؤكد إذا:
 *   inlinePairCount >= 1
 *   أو (standaloneHeaderCount >= 2 و dialogueFollowerCount >= 2 و actionContaminationCount === 0)
 */
const isEvidenceConfirmed = (ev: CharacterEvidence): boolean => {
  if (ev.inlinePairCount >= 1) return true;
  if (
    ev.standaloneHeaderCount >= 2 &&
    ev.dialogueFollowerCount >= 2 &&
    ev.actionContaminationCount === 0
  ) {
    return true;
  }
  return false;
};

const RUNTIME_SESSION_ID = "__runtime-paste-session__";
const MAX_RECENT_TYPES = 20;
const MAX_RUNTIME_RECORDS = 120;

const MEMORY_INVALID_SINGLE_TOKEN_RE =
  /^(?:أنا|انا|إنت|انت|أنت|أنتِ|إنتي|انتي|هو|هي|هم|هن|إحنا|احنا|نحن|أنتم|انتم)$/;

const isValidMemoryCharacterName = (rawName: string): boolean => {
  const normalized = normalizeCharacterName(rawName);
  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 40) return false;
  if (/[؟!؟,،"«»]/.test(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (tokens.length === 1 && MEMORY_INVALID_SINGLE_TOKEN_RE.test(tokens[0]))
    return false;
  return true;
};

const detectLocalRepeatedPattern = (
  classifications: readonly string[]
): string | null => {
  if (!Array.isArray(classifications) || classifications.length < 4)
    return null;

  const detectInOrder = (ordered: readonly string[]): string | null => {
    const pairCounts = new Map<string, number>();
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const first = (ordered[i] || "").trim();
      const second = (ordered[i + 1] || "").trim();
      if (!first || !second) continue;
      const key = `${first}-${second}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }

    let bestPattern: string | null = null;
    let bestCount = 0;
    pairCounts.forEach((count, pattern) => {
      if (count > bestCount) {
        bestCount = count;
        bestPattern = pattern;
      }
    });

    return bestCount >= 2 ? bestPattern : null;
  };

  return (
    detectInOrder(classifications) ||
    detectInOrder([...classifications].reverse())
  );
};

export class ContextMemoryManager {
  private storage: Map<string, EnhancedContextMemory> = new Map();
  private runtimeRecords: ClassifiedDraft[] = [];
  private _confirmedCharacters: Set<string> = new Set();
  private _characterEvidence: Map<string, CharacterEvidence> = new Map();

  constructor() {
    logger.info("ContextMemoryManager initialized (enhanced).", {
      scope: "MemoryManager",
    });
  }

  async loadContext(sessionId: string): Promise<EnhancedContextMemory | null> {
    if (this.storage.has(sessionId)) {
      logger.info(`Loading context for session: ${sessionId}`, {
        scope: "MemoryManager",
      });
      return JSON.parse(JSON.stringify(this.storage.get(sessionId)!));
    }

    const loaded = this.loadFromLocalStorage(sessionId);
    if (loaded) {
      this.storage.set(sessionId, loaded);
      return loaded;
    }

    logger.debug(
      `No context found for session: ${sessionId} (سيتم إنشاء سياق جديد)`,
      {
        scope: "MemoryManager",
      }
    );
    return null;
  }

  async saveContext(
    sessionId: string,
    memory: EnhancedContextMemory | ContextMemory
  ): Promise<void> {
    logger.info(`Saving context for session: ${sessionId}`, {
      scope: "MemoryManager",
    });

    const enhanced = this.ensureEnhanced(memory);
    this.storage.set(sessionId, JSON.parse(JSON.stringify(enhanced)));
    this.saveToLocalStorage(sessionId);
  }

  async updateMemory(
    sessionId: string,
    classifications: ClassificationRecord[]
  ): Promise<void> {
    logger.info(
      `Updating memory for session ${sessionId} with ${classifications.length} records.`,
      { scope: "MemoryManager" }
    );

    const existing = await this.loadContext(sessionId);
    const memory: EnhancedContextMemory =
      existing || this.createDefaultMemory(sessionId);

    memory.lastModified = Date.now();
    memory.data.lastClassifications = classifications
      .map((record) => record.classification)
      .concat(memory.data.lastClassifications)
      .slice(0, MAX_RECENT_TYPES);

    classifications.forEach((record) => {
      if (record.classification !== "character") return;
      const characterName = normalizeCharacterName(record.line);
      if (!isValidMemoryCharacterName(characterName)) return;

      if (!memory.data.commonCharacters.includes(characterName)) {
        memory.data.commonCharacters.push(characterName);
      }

      memory.data.characterDialogueMap[characterName] =
        (memory.data.characterDialogueMap[characterName] || 0) + 1;
    });

    await this.saveContext(sessionId, memory);
  }

  saveToLocalStorage(sessionId: string): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;
    const key = `screenplay-memory-${sessionId}`;
    saveToStorage(key, memory);
  }

  loadFromLocalStorage(sessionId: string): EnhancedContextMemory | null {
    const key = `screenplay-memory-${sessionId}`;
    const parsed = loadFromStorage<EnhancedContextMemory | null>(key, null);
    if (!parsed) return null;
    return this.ensureEnhanced(parsed);
  }

  trackDialogueBlock(
    sessionId: string,
    character: string,
    startLine: number,
    endLine: number
  ): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.dialogueBlocks.push({
      character,
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
    });

    if (memory.data.dialogueBlocks.length > 50) {
      memory.data.dialogueBlocks = memory.data.dialogueBlocks.slice(-50);
    }

    this.saveToLocalStorage(sessionId);
  }

  addLineRelation(sessionId: string, relation: LineRelation): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.lineRelationships.push(relation);
    if (memory.data.lineRelationships.length > 200) {
      memory.data.lineRelationships = memory.data.lineRelationships.slice(-200);
    }

    this.saveToLocalStorage(sessionId);
  }

  detectPattern(sessionId: string): string | null {
    let memory = this.storage.get(sessionId);
    if (!memory) {
      const loaded = this.loadFromLocalStorage(sessionId);
      if (loaded) {
        this.storage.set(sessionId, loaded);
        memory = loaded;
      }
    }
    if (!memory) return null;

    return detectLocalRepeatedPattern(memory.data.lastClassifications);
  }

  addUserCorrection(sessionId: string, correction: Correction): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.userCorrections.push(correction);
    if (memory.data.userCorrections.length > 200) {
      memory.data.userCorrections = memory.data.userCorrections.slice(-200);
    }

    this.saveToLocalStorage(sessionId);
  }

  getUserCorrections(sessionId: string): Correction[] {
    const memory = this.storage.get(sessionId);
    return memory ? [...memory.data.userCorrections] : [];
  }

  updateConfidence(sessionId: string, line: string, confidence: number): void {
    const memory = this.storage.get(sessionId);
    if (!memory) return;

    memory.data.confidenceMap[line] = confidence;
    this.saveToLocalStorage(sessionId);
  }

  record(entry: ClassifiedDraft): void {
    pipelineRecorder.trackFile("context-memory-manager.ts");
    this.runtimeRecords.push(entry);
    if (this.runtimeRecords.length > MAX_RUNTIME_RECORDS) {
      this.runtimeRecords = this.runtimeRecords.slice(-MAX_RUNTIME_RECORDS);
    }

    const memory = this.getOrCreateRuntimeMemory();
    memory.lastModified = Date.now();
    this.applyRuntimeRecord(entry, memory);
  }

  replaceLast(entry: ClassifiedDraft): void {
    if (this.runtimeRecords.length === 0) {
      this.record(entry);
      return;
    }

    this.runtimeRecords[this.runtimeRecords.length - 1] = entry;
    this.rebuildRuntimeAggregates();
  }

  /**
   * بذر الـ registry من inline patterns (regex-based) — يتنادى مرة واحدة قبل الـ loop.
   * بيعمل scan بـ `parseInlineCharacterDialogue` ويضيف الأسماء المؤكدة فقط.
   * بيغذّي الـ evidence map بـ inlinePairCount.
   */
  seedFromInlinePatterns(lines: string[]): void {
    for (const line of lines) {
      const trimmed = (line ?? "").trim();
      if (!trimmed) continue;
      const parsed = parseInlineCharacterDialogue(trimmed);
      if (parsed) {
        const normalizedName = normalizeCharacterName(parsed.characterName);
        if (normalizedName && isValidMemoryCharacterName(normalizedName)) {
          this._confirmedCharacters.add(normalizedName);
          const ev =
            this._characterEvidence.get(normalizedName) ??
            createEmptyEvidence();
          ev.inlinePairCount++;
          ev.repeatCount++;
          this._characterEvidence.set(normalizedName, ev);
        }
      }
    }
  }

  /**
   * بذر الـ registry من standalone patterns (اسم: على سطر + حوار على سطر تالي).
   * يتنادى مرة واحدة بعد seedFromInlinePatterns وقبل الـ loop.
   *
   * شروط صارمة:
   * 1. السطر ينتهي بـ `:` أو `：`
   * 2. بعد إزالة الـ colon: ≤3 tokens + يعدّي isCandidateCharacterName
   * 3. السطر التالي مش colon line (مش character تاني)
   * 4. السطر التالي dialogue-leaning هيكلياً
   * 5. النمط يتكرر ≥2 مرات لنفس الاسم
   * 6. الاسم ليس فعل (مش action verb)
   */
  seedFromStandalonePatterns(lines: string[]): void {
    // regex هيكلي — سطر تالي فيه إشارة حوار
    const DIALOGUE_FOLLOWER_RE = /[؟?!]|(?:\.{2,}|…)/;
    // المرحلة الأولى: جمع candidates مع عدد التكرار
    const candidates = new Map<
      string,
      { count: number; followerCount: number }
    >();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = (lines[i] ?? "").trim();
      if (!trimmed) continue;

      // شرط 1: ينتهي بـ colon
      if (!/[:：]\s*$/.test(trimmed)) continue;

      // شرط 2: اسم صالح بعد إزالة colon
      const namePart = normalizeCharacterName(trimmed);
      if (!namePart) continue;
      const tokens = namePart.split(/\s+/).filter(Boolean);
      if (tokens.length === 0 || tokens.length > 3) continue;
      if (!isCandidateCharacterName(namePart)) continue;

      // شرط إضافي: الاسم مش فعل
      if (isActionVerbStart(namePart)) continue;

      // شرط 3+4: السطر التالي موجود ومش colon line + dialogue-leaning
      const nextLine = (lines[i + 1] ?? "").trim();
      if (!nextLine) continue;
      if (/[:：]\s*$/.test(nextLine)) continue;

      // شرط 4: السطر التالي dialogue-leaning هيكلياً
      const nextTokens = nextLine.split(/\s+/).filter(Boolean);
      const isDialogueLeaning =
        DIALOGUE_FOLLOWER_RE.test(nextLine) ||
        (nextTokens.length >= 2 &&
          nextTokens.length <= 20 &&
          !isActionVerbStart(nextLine));

      if (!isDialogueLeaning) continue;

      const entry = candidates.get(namePart) ?? { count: 0, followerCount: 0 };
      entry.count++;
      entry.followerCount++;
      candidates.set(namePart, entry);
    }

    // المرحلة الثانية: شرط 5 — التكرار ≥ 2 + لا action contamination
    for (const [name, stats] of candidates) {
      if (stats.count < 2) continue;

      // شرط 6: لا action contamination — الاسم مش ظهر كبداية فعل في أي سطر آخر
      const hasContamination = lines.some((l) => {
        const t = (l ?? "").trim();
        if (!t || /[:：]\s*$/.test(t)) return false;
        const firstWord = t.split(/\s+/)[0] ?? "";
        return (
          normalizeCharacterName(firstWord) === name && isActionVerbStart(t)
        );
      });

      if (hasContamination) continue;

      this._confirmedCharacters.add(name);
      const ev = this._characterEvidence.get(name) ?? createEmptyEvidence();
      ev.standaloneHeaderCount += stats.count;
      ev.dialogueFollowerCount += stats.followerCount;
      ev.repeatCount += stats.count;
      this._characterEvidence.set(name, ev);
    }
  }

  /**
   * الأسماء المؤكدة من المسح الأولي فقط (قبل التصنيف).
   * يُستخدم في التصحيح الرجعي للتمييز بين الأسماء المُؤكدة والمُكتشفة أثناء التصنيف.
   */
  getPreSeededCharacters(): ReadonlySet<string> {
    return this._confirmedCharacters;
  }

  /**
   * هل الاسم ده مؤكد كشخصية؟
   * القرار مبني على evidence policy — مش مجرد وجود في Set.
   */
  isConfirmedCharacter(name: string): boolean {
    const normalized = normalizeCharacterName(name);
    if (!normalized) return false;
    // مؤكد من الـ seed الأولي (inline أو standalone)
    if (this._confirmedCharacters.has(normalized)) return true;
    // مؤكد من evidence مجمّعة أثناء الـ runtime
    const ev = this._characterEvidence.get(normalized);
    if (ev && isEvidenceConfirmed(ev)) return true;
    return false;
  }

  /**
   * جلب أدلة شخصية معينة — null لو مفيش أدلة.
   */
  getCharacterEvidence(name: string): CharacterEvidence | null {
    const normalized = normalizeCharacterName(name);
    if (!normalized) return null;
    return this._characterEvidence.get(normalized) ?? null;
  }

  getSnapshot(): ContextMemorySnapshot {
    const memory = this.getOrCreateRuntimeMemory();
    const frequency = new Map<string, number>();

    Object.entries(memory.data.characterDialogueMap).forEach(
      ([name, count]) => {
        if (!Number.isFinite(count) || count <= 0) return;
        frequency.set(name, count);
      }
    );

    const recentTypes = [...memory.data.lastClassifications];

    // حساب isInDialogueFlow من آخر نوع
    const lastType = recentTypes.at(-1);
    const isInDialogueFlow =
      lastType === "character" ||
      lastType === "dialogue" ||
      lastType === "parenthetical";

    // آخر شخصية اتكلمت
    let lastCharacterName: string | null = null;
    for (let i = this.runtimeRecords.length - 1; i >= 0; i--) {
      if (this.runtimeRecords[i].type === "character") {
        lastCharacterName = normalizeCharacterName(this.runtimeRecords[i].text);
        break;
      }
    }

    // عمق الحوار — كام سطر متتالي في dialogue flow
    let dialogueDepth = 0;
    for (let i = recentTypes.length - 1; i >= 0; i--) {
      const t = recentTypes[i];
      if (t === "dialogue" || t === "parenthetical") {
        dialogueDepth++;
      } else if (t === "character") {
        dialogueDepth++;
        break;
      } else {
        break;
      }
    }

    // دمج inline-seeded + runtime evidence-confirmed
    const confirmedCharacters = new Set(this._confirmedCharacters);
    for (const [name] of this._characterEvidence) {
      const ev = this._characterEvidence.get(name)!;
      if (isEvidenceConfirmed(ev)) confirmedCharacters.add(name);
    }
    // أي اسم ظهر runtime بـ count >= 1 وعنده evidence مؤكدة
    for (const [name, count] of frequency) {
      if (count >= 1) {
        const ev = this._characterEvidence.get(name);
        if (ev && isEvidenceConfirmed(ev)) confirmedCharacters.add(name);
      }
    }

    return {
      recentTypes,
      characterFrequency: frequency,
      confirmedCharacters,
      characterEvidence: new Map(this._characterEvidence),
      isInDialogueFlow,
      lastCharacterName,
      dialogueDepth,
    };
  }

  /**
   * تصحيح رجعي لسجل واحد في runtimeRecords عند index محدد.
   * يُحدّث السجل ويُعيد بناء كل الإحصائيات من ذلك الـ index حتى النهاية.
   *
   * @param index - موقع السجل المراد تصحيحه
   * @param newEntry - السجل المُصحّح الجديد
   */
  retroCorrect(index: number, newEntry: ClassifiedDraft): void {
    if (index < 0 || index >= this.runtimeRecords.length) return;
    this.runtimeRecords[index] = newEntry;
    this.rebuildRuntimeAggregates();
  }

  /**
   * تحليل هيكلي لكتلة أسطر بين startIdx و endIdx.
   * يُرجع إحصائيات بنيوية بدون أي قوائم كلمات ثابتة.
   *
   * @param startIdx - بداية الكتلة (0-indexed)
   * @param endIdx - نهاية الكتلة (inclusive)
   * @returns تحليل هيكلي للكتلة
   */
  getBlockAnalysis(
    startIdx: number,
    endIdx: number
  ): {
    totalLines: number;
    linesEndingWithColon: number;
    actionWithoutStrongSignal: number;
    typeDistribution: Record<string, number>;
    hasConsecutiveSameType: boolean;
    dominantType: ElementType | null;
  } {
    const safeStart = Math.max(0, startIdx);
    const safeEnd = Math.min(this.runtimeRecords.length - 1, endIdx);
    const slice = this.runtimeRecords.slice(safeStart, safeEnd + 1);

    const typeDist: Record<string, number> = {};
    let linesEndingWithColon = 0;
    let actionWithoutStrongSignal = 0;
    let hasConsecutiveSameType = false;

    for (let i = 0; i < slice.length; i++) {
      const entry = slice[i];
      typeDist[entry.type] = (typeDist[entry.type] ?? 0) + 1;

      if (/[:：]\s*$/.test(entry.text.trim())) {
        linesEndingWithColon++;
      }

      if (entry.type === "action" && !/^[-–—]/.test(entry.text.trim())) {
        actionWithoutStrongSignal++;
      }

      if (i > 0 && slice[i - 1].type === entry.type) {
        hasConsecutiveSameType = true;
      }
    }

    // النوع المهيمن
    let dominantType: ElementType | null = null;
    let maxCount = 0;
    for (const [typeKey, count] of Object.entries(typeDist)) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = typeKey as ElementType;
      }
    }

    return {
      totalLines: slice.length,
      linesEndingWithColon,
      actionWithoutStrongSignal,
      typeDistribution: typeDist,
      hasConsecutiveSameType,
      dominantType,
    };
  }

  /**
   * إعادة بناء كاملة من مصفوفة drafts مُصحّحة.
   * يُستدعى من retroactiveCorrectionPass بعد تعديل التصنيفات.
   *
   * @param correctedDrafts - المصفوفة الكاملة بعد التصحيح الرجعي
   */
  rebuildFromCorrectedDrafts(
    correctedDrafts: readonly ClassifiedDraft[]
  ): void {
    this.runtimeRecords = correctedDrafts.map((d) => ({ ...d }));
    if (this.runtimeRecords.length > MAX_RUNTIME_RECORDS) {
      this.runtimeRecords = this.runtimeRecords.slice(-MAX_RUNTIME_RECORDS);
    }
    this.rebuildRuntimeAggregates();
  }

  /**
   * إعادة تعيين ذاكرة السياق — جلسة محددة أو جميع الجلسات.
   */
  reset(sessionId?: string): void {
    if (sessionId) {
      this.storage.delete(sessionId);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(`screenplay-memory-${sessionId}`);
        } catch {
          // ignore storage failures in reset
        }
      }
      return;
    }

    this.storage.clear();
    this.runtimeRecords = [];

    if (typeof window !== "undefined") {
      try {
        const keys = Object.keys(window.localStorage);
        for (const key of keys) {
          if (key.startsWith("screenplay-memory-")) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore storage failures in reset
      }
    }
  }

  private applyRuntimeRecord(
    entry: ClassifiedDraft,
    memory: EnhancedContextMemory
  ): void {
    memory.data.lastClassifications = [
      ...memory.data.lastClassifications,
      entry.type,
    ].slice(-MAX_RECENT_TYPES);

    if (entry.type !== "character") return;
    const characterName = normalizeCharacterName(entry.text);
    if (!isValidMemoryCharacterName(characterName)) return;

    if (!memory.data.commonCharacters.includes(characterName)) {
      memory.data.commonCharacters.push(characterName);
    }

    memory.data.characterDialogueMap[characterName] =
      (memory.data.characterDialogueMap[characterName] || 0) + 1;

    // تحديث evidence map — confidence عالية (regex path) تزيد inlinePairCount
    // confidence منخفضة (context/hybrid) تزيد repeatCount فقط (anti-contamination)
    const ev =
      this._characterEvidence.get(characterName) ?? createEmptyEvidence();
    ev.repeatCount++;
    if (entry.confidence >= 88) {
      ev.inlinePairCount++;
    }
    this._characterEvidence.set(characterName, ev);
  }

  private rebuildRuntimeAggregates(): void {
    const memory = this.getOrCreateRuntimeMemory();
    memory.lastModified = Date.now();
    memory.data.lastClassifications = this.runtimeRecords
      .slice(-MAX_RECENT_TYPES)
      .map((record) => record.type);
    memory.data.characterDialogueMap = {};
    memory.data.commonCharacters = [];

    this.runtimeRecords.forEach((record) => {
      if (record.type !== "character") return;
      const characterName = normalizeCharacterName(record.text);
      if (!isValidMemoryCharacterName(characterName)) return;

      if (!memory.data.commonCharacters.includes(characterName)) {
        memory.data.commonCharacters.push(characterName);
      }

      memory.data.characterDialogueMap[characterName] =
        (memory.data.characterDialogueMap[characterName] || 0) + 1;
    });
  }

  private getOrCreateRuntimeMemory(): EnhancedContextMemory {
    const existing = this.storage.get(RUNTIME_SESSION_ID);
    if (existing) return existing;

    const created = this.createDefaultMemory(RUNTIME_SESSION_ID);
    this.storage.set(RUNTIME_SESSION_ID, created);
    return created;
  }

  private createDefaultMemory(sessionId: string): EnhancedContextMemory {
    return {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: [],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
        dialogueBlocks: [],
        lineRelationships: [],
        userCorrections: [],
        confidenceMap: {},
      },
    };
  }

  private ensureEnhanced(
    memory: ContextMemory | EnhancedContextMemory
  ): EnhancedContextMemory {
    const data = memory.data as EnhancedContextMemory["data"];
    return {
      ...memory,
      data: {
        ...memory.data,
        dialogueBlocks: data.dialogueBlocks || [],
        lineRelationships: data.lineRelationships || [],
        userCorrections: data.userCorrections || [],
        confidenceMap: data.confidenceMap || {},
      },
    };
  }
}
