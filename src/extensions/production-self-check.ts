import { createElement } from "react";
import { createRoot } from "react-dom/client";
import * as uiKit from "../components/ui";
import {
  EDITOR_STYLE_FORMAT_IDS,
  applyEditorFormatStyleVariables,
  getFormatStyles,
  getSpacingMarginTop,
} from "../constants/editor-format-styles";
import {
  classificationTypeOptions,
  formatClassMap,
  formatShortcutMap,
  screenplayFormats,
} from "../constants/formats";
import { collectActionEvidence, isActionLine } from "./action";
import { convertHindiToArabic, detectDialect } from "./arabic-patterns";
import {
  parseReviewCommands,
  requestAgentReview,
} from "./Arabic-Screenplay-Classifier-Agent";
import { isBasmalaLine } from "./basmala";
import {
  ensureCharacterTrailingColon,
  isCharacterLine,
  parseImplicitCharacterDialogueWithoutColon,
  parseInlineCharacterDialogue,
} from "./character";
import { PostClassificationReviewer } from "./classification-core";
import {
  getContextTypeScore,
  isDialogueHardBreaker,
  passesActionDefinitionGate,
  passesCharacterDefinitionGate,
  passesDialogueDefinitionGate,
  resolveNarrativeDecision,
  scoreActionEvidence,
} from "./classification-decision";
import {
  CLASSIFICATION_SEQUENCE_VIOLATION_SEVERITY,
  CLASSIFICATION_VALID_SEQUENCES,
  suggestTypeFromClassificationSequence,
} from "./classification-sequence-rules";
import {
  fromLegacyElementType,
  isElementType,
  toLegacyElementType,
  type ClassifiedLine,
  type ClassificationContext,
  type ElementType,
} from "./classification-types";
import { ContextMemoryManager } from "./context-memory-manager";
import {
  getDialogueProbability,
  hasDirectDialogueCues,
  isDialogueContinuationLine,
  isDialogueLine,
} from "./dialogue";
import { HybridClassifier } from "./hybrid-classifier";
import {
  extractPlainTextFromHtmlLikeLine,
  mergeBrokenCharacterName,
  parseBulletLine,
  shouldMergeWrappedLines,
} from "./line-repair";
import { isParentheticalLine } from "./parenthetical";
import { classifyText, classifyTextWithAgentReview } from "./paste-classifier";
import {
  extractSceneHeader1Number,
  isSceneHeader1Line,
} from "./scene-header-1";
import { isSceneHeader2Line } from "./scene-header-2";
import { isSceneHeader3Line } from "./scene-header-3";
import {
  isCompleteSceneHeaderLine,
  splitSceneHeaderLine,
} from "./scene-header-top-line";
import {
  cleanInvisibleChars,
  hasActionVerbStructure,
  hasDirectDialogueMarkers,
  hasSentencePunctuation,
  isActionCueLine,
  isActionVerbStart,
  isActionWithDash,
  isImperativeStart,
  looksLikeNarrativeActionSyntax,
  matchesActionStartPattern,
  normalizeCharacterName,
  normalizeLine,
  startsWithBullet,
  stripLeadingBullets,
} from "./text-utils";
import { isTransitionLine } from "./transition";
import { logger } from "../utils/logger";

export type ProductionSelfCheckTrigger =
  | "editor-import"
  | "manual-auto-check"
  | "manual-reclassify";

export interface ProductionSelfCheckOptions {
  trigger: ProductionSelfCheckTrigger;
  sampleText?: string;
  force?: boolean;
}

export interface ProductionSelfCheckReport {
  trigger: ProductionSelfCheckTrigger;
  executedFunctions: number;
  failedFunctions: number;
  uiFunctionsExecuted: number;
  extensionFunctionsExecuted: number;
  durationMs: number;
  failures: ReadonlyArray<{ name: string; message: string }>;
}

const selfCheckLogger = logger.createScope("production-self-check");
const EXTENSION_FUNCTION_CALL_COUNT = 62;
const CONSTANT_FUNCTION_CALL_COUNT = EDITOR_STYLE_FORMAT_IDS.length * 2 + 1;

let hasExecutedSelfCheck = false;
let lastReport: ProductionSelfCheckReport | null = null;
let inFlightSelfCheck: Promise<ProductionSelfCheckReport> | null = null;

const baseContext: ClassificationContext = {
  previousTypes: [
    "scene_header_top_line",
    "scene_header_3",
    "action",
    "character",
    "dialogue",
  ],
  previousType: "dialogue",
  isInDialogueBlock: true,
  isAfterSceneHeaderTopLine: false,
};

const sampleClassifiedLines: ClassifiedLine[] = [
  {
    lineIndex: 0,
    text: "مشهد 1: ليل - داخلي",
    assignedType: "scene_header_top_line",
    originalConfidence: 96,
    classificationMethod: "regex",
  },
  {
    lineIndex: 1,
    text: "شقة سيد",
    assignedType: "scene_header_3",
    originalConfidence: 88,
    classificationMethod: "context",
  },
  {
    lineIndex: 2,
    text: "أحمد:",
    assignedType: "character",
    originalConfidence: 92,
    classificationMethod: "regex",
  },
  {
    lineIndex: 3,
    text: "أنا هنا الآن.",
    assignedType: "dialogue",
    originalConfidence: 84,
    classificationMethod: "context",
  },
];

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const consumeUiResult = (result: unknown): void => {
  if (!result) return;

  const target = result as {
    element?: unknown;
    destroy?: unknown;
  };

  if (target.element instanceof HTMLElement) {
    // Force a measurable DOM usage path.
    const fragment = document.createDocumentFragment();
    fragment.appendChild(target.element);
  }

  if (typeof target.destroy === "function") {
    (target.destroy as () => void)();
  }
};

const invokeUiFactory = async (name: string, value: unknown): Promise<void> => {
  if (typeof value !== "function") return;

  switch (name) {
    case "createUiPrimitive": {
      consumeUiResult(
        (value as (moduleName: string, text?: string) => unknown)(
          "factory",
          "factory"
        )
      );
      return;
    }
    case "createUiButtonPrimitive": {
      consumeUiResult(
        (value as (moduleName: string, label?: string) => unknown)(
          "factory-button",
          "factory-button"
        )
      );
      return;
    }
    case "createDropdownMenu": {
      consumeUiResult(
        (
          value as (options: {
            label: string;
            actions: ReadonlyArray<{ id: string; label: string }>;
            onAction: (actionId: string) => void;
          }) => unknown
        )({
          label: "قائمة",
          actions: [{ id: "open", label: "فتح" }],
          onAction: () => undefined,
        })
      );
      return;
    }
    case "createNavigationMenu": {
      consumeUiResult(
        (
          value as (
            sections: ReadonlyArray<{
              label: string;
              actions: ReadonlyArray<{ id: string; label: string }>;
            }>,
            onAction: (actionId: string) => void
          ) => unknown
        )(
          [
            {
              label: "ملف",
              actions: [{ id: "new", label: "جديد" }],
            },
          ],
          () => undefined
        )
      );
      return;
    }
    case "createHoverCard": {
      consumeUiResult(
        (
          value as (
            content: HTMLElement | string,
            className?: string
          ) => unknown
        )("hover card")
      );
      return;
    }
    case "createToastElement": {
      consumeUiResult(
        (
          value as (
            payload: {
              id: string;
              title?: string;
              description?: string;
            },
            onDismiss: (id: string) => void
          ) => unknown
        )(
          {
            id: "self-check",
            title: "Self check",
            description: "toast path",
          },
          () => undefined
        )
      );
      return;
    }
    case "HoverBorderGradient": {
      const mount = document.createElement("div");
      const root = createRoot(mount);
      root.render(
        createElement(
          value as React.ElementType,
          { as: "div", className: "h-2 w-2" },
          "hover"
        )
      );
      root.unmount();
      return;
    }
    case "Toaster":
    case "SonnerToaster": {
      const Instance = value as new () => { destroy?: () => void };
      const instance = new Instance();
      if (typeof instance.destroy === "function") {
        instance.destroy();
      }
      return;
    }
    default: {
      consumeUiResult((value as (...args: never[]) => unknown)());
    }
  }
};

const runExtensionFunctionCalls = async (sampleText: string): Promise<void> => {
  const evidence = collectActionEvidence(sampleText);
  const dialogueProbability = getDialogueProbability(sampleText, baseContext);

  cleanInvisibleChars(sampleText);
  normalizeLine(sampleText);
  stripLeadingBullets("- " + sampleText);
  startsWithBullet("- " + sampleText);
  normalizeCharacterName("أحمد:");
  hasSentencePunctuation("هل أنت بخير؟");
  isActionWithDash("- يدخل أحمد");
  isActionCueLine("بهدوء");
  isImperativeStart("ادخل الآن");
  matchesActionStartPattern("ثم يدخل أحمد");
  isActionVerbStart("يدخل أحمد");
  hasActionVerbStructure("هو يفتح الباب");
  looksLikeNarrativeActionSyntax("ثم يدخل أحمد إلى البيت");
  hasDirectDialogueMarkers('"أنا هنا"');

  isActionLine(sampleText, baseContext);
  detectDialect("عايز اروح دلوقتي");
  convertHindiToArabic("١٢٣");
  isBasmalaLine("بسم الله الرحمن الرحيم");
  ensureCharacterTrailingColon("أحمد");
  parseInlineCharacterDialogue("بهدوء أحمد: أنا هنا");
  parseImplicitCharacterDialogueWithoutColon("أحمد أنا هنا؟", baseContext);
  isCharacterLine("أحمد:", baseContext);

  getContextTypeScore(baseContext, ["dialogue"]);
  scoreActionEvidence(evidence);
  passesActionDefinitionGate(sampleText, baseContext, evidence);
  isDialogueHardBreaker(sampleText, baseContext, evidence);
  passesDialogueDefinitionGate(
    sampleText,
    baseContext,
    dialogueProbability,
    evidence
  );
  passesCharacterDefinitionGate("أحمد:", baseContext);
  resolveNarrativeDecision(sampleText, baseContext);

  CLASSIFICATION_VALID_SEQUENCES.get("character");
  CLASSIFICATION_SEQUENCE_VIOLATION_SEVERITY.get("character→character");
  suggestTypeFromClassificationSequence("dialogue", {
    isParenthetical: false,
    endsWithColon: true,
    wordCount: 2,
    hasPunctuation: false,
    startsWithDash: false,
    hasActionIndicators: false,
  });

  isElementType("dialogue");
  fromLegacyElementType("scene_header_top_line");
  toLegacyElementType("dialogue");

  hasDirectDialogueCues("يا أحمد!");
  isDialogueContinuationLine("  كمل كلامك", "dialogue");
  isDialogueLine("أنا هنا.", baseContext);

  extractPlainTextFromHtmlLikeLine("<p>مرحبا</p>");
  parseBulletLine("• مرحبا");
  shouldMergeWrappedLines("أنا بخير", "... ومبسوط", "dialogue");
  mergeBrokenCharacterName("عبد", "الرحمن:");

  isParentheticalLine("(بهدوء)");

  extractSceneHeader1Number("مشهد 1");
  isSceneHeader1Line("مشهد 2");
  isSceneHeader2Line("ليل - داخلي");
  isSceneHeader3Line("شقة سيد", {
    ...baseContext,
    previousType: "scene_header_top_line",
    isAfterSceneHeaderTopLine: true,
  });
  splitSceneHeaderLine("مشهد 1: ليل - داخلي");
  isCompleteSceneHeaderLine("مشهد 1: ليل - داخلي");
  isTransitionLine("قطع إلى");

  classifyText(sampleText);
  await classifyTextWithAgentReview("");

  const reviewer = new PostClassificationReviewer();
  const packet = reviewer.review(sampleClassifiedLines);
  reviewer.reviewSingleLine(sampleClassifiedLines[2], sampleClassifiedLines);
  reviewer.formatForLLM(packet);

  const memory = new ContextMemoryManager();
  const sessionId = "production-self-check";
  await memory.updateMemory(sessionId, [
    { line: "أحمد:", classification: "character" as ElementType },
    { line: "أنا هنا", classification: "dialogue" as ElementType },
  ]);
  memory.trackDialogueBlock(sessionId, "أحمد", 2, 3);
  memory.addLineRelation(sessionId, {
    previousLine: "أحمد:",
    currentLine: "أنا هنا",
    relationType: "follows",
  });
  memory.addUserCorrection(sessionId, {
    line: "أنا هنا",
    originalClassification: "action",
    newClassification: "dialogue",
    timestamp: Date.now(),
  });
  memory.updateConfidence(sessionId, "أنا هنا", 0.89);
  memory.record({
    type: "character",
    text: "أحمد:",
    confidence: 90,
    classificationMethod: "context",
  });
  memory.replaceLast({
    type: "character",
    text: "أحمد:",
    confidence: 92,
    classificationMethod: "context",
  });
  const snapshot = memory.getSnapshot();
  memory.detectPattern(sessionId);
  memory.getUserCorrections(sessionId);
  await memory.saveContext(sessionId, {
    sessionId,
    data: {
      commonCharacters: ["أحمد"],
      commonLocations: [],
      lastClassifications: ["character", "dialogue"],
      characterDialogueMap: { أحمد: 2 },
      dialogueBlocks: [],
      lineRelationships: [],
      userCorrections: [],
      confidenceMap: {},
    },
  });
  await memory.loadContext(sessionId);

  const hybrid = new HybridClassifier();
  hybrid.classifyLine(sampleText, "action", baseContext, snapshot);

  // فحص parseReviewCommands (v2 — commands بدل decisions)
  parseReviewCommands(
    JSON.stringify({
      commands: [
        {
          op: "relabel",
          itemId: "self-check-item-0",
          newType: "action",
          confidence: 0.9,
          reason: "ok",
        },
      ],
    })
  );

  // فحص requestAgentReview (v2 — بدون ScreenplayClassifier)
  try {
    await requestAgentReview({
      importOpId: crypto.randomUUID(),
      sessionId: "self-check-session",
      items: [
        {
          itemId: "self-check-item-0",
          type: "action",
          text: sampleText,
          fingerprint: "self-check-fp",
        },
      ],
      requiredItemIds: ["self-check-item-0"],
      forcedItemIds: ["self-check-item-0"],
    });
  } catch {
    // متوقع في بيئة الاختبار (لا خادم وكيل).
  }
};

const runUiFunctionCalls = async (): Promise<number> => {
  let executed = 0;

  for (const [name, value] of Object.entries(uiKit)) {
    if (typeof value !== "function") continue;
    await invokeUiFactory(name, value);
    executed += 1;
  }

  return executed;
};

const runConstantsFunctionCalls = (): void => {
  const temp = document.createElement("div");
  applyEditorFormatStyleVariables(temp.style);

  for (const id of EDITOR_STYLE_FORMAT_IDS) {
    getFormatStyles(id);
  }

  for (const current of EDITOR_STYLE_FORMAT_IDS) {
    getSpacingMarginTop("action", current);
  }

  void screenplayFormats.length;
  void Object.keys(formatClassMap).length;
  void Object.keys(formatShortcutMap).length;
  void classificationTypeOptions.length;
};

export const runProductionSelfCheck = async (
  options: ProductionSelfCheckOptions
): Promise<ProductionSelfCheckReport> => {
  if (!options.force && hasExecutedSelfCheck && lastReport) {
    return lastReport;
  }

  if (!options.force && inFlightSelfCheck) {
    return inFlightSelfCheck;
  }

  const run = (async (): Promise<ProductionSelfCheckReport> => {
    const startedAt = performance.now();
    const failures: Array<{ name: string; message: string }> = [];

    const sampleText =
      (options.sampleText ?? "ثم يدخل أحمد إلى البيت.").trim() ||
      "ثم يدخل أحمد إلى البيت.";

    let extensionFunctionsExecuted = 0;
    let uiFunctionsExecuted = 0;

    try {
      await runExtensionFunctionCalls(sampleText);
      extensionFunctionsExecuted += EXTENSION_FUNCTION_CALL_COUNT;
    } catch (error) {
      failures.push({ name: "extensions-batch", message: safeMessage(error) });
    }

    try {
      uiFunctionsExecuted += await runUiFunctionCalls();
    } catch (error) {
      failures.push({ name: "ui-batch", message: safeMessage(error) });
    }

    try {
      runConstantsFunctionCalls();
      extensionFunctionsExecuted += CONSTANT_FUNCTION_CALL_COUNT;
    } catch (error) {
      failures.push({ name: "constants-batch", message: safeMessage(error) });
    }

    const report: ProductionSelfCheckReport = {
      trigger: options.trigger,
      executedFunctions: extensionFunctionsExecuted + uiFunctionsExecuted,
      failedFunctions: failures.length,
      uiFunctionsExecuted,
      extensionFunctionsExecuted,
      durationMs: Math.round(performance.now() - startedAt),
      failures,
    };

    hasExecutedSelfCheck = true;
    lastReport = report;

    selfCheckLogger.info("Production self-check completed", report);

    return report;
  })();

  inFlightSelfCheck = run;

  try {
    return await run;
  } finally {
    inFlightSelfCheck = null;
  }
};
