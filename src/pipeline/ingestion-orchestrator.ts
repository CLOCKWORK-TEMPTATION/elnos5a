/**
 * @fileoverview Ingestion Orchestrator
 */

import type { EditorView } from "@tiptap/pm/view";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { ScreenplayBlock } from "../utils/file-import";
import { toLegacyElementType } from "../extensions/classification-types";
import {
  assessTrustLevel,
  type InputTrustLevel,
  type StructuredBlock,
} from "./trust-policy";
import type { ClassifiedItem } from "./editor-insertion";
import { telemetry } from "./telemetry";
import { classifyLines } from "../extensions/paste-classifier";
import { logger } from "../utils/logger";

const orchestratorLogger = logger.createScope("ingestion-orchestrator");

export type TrustLevel = InputTrustLevel;

export interface IngestionResult {
  success: boolean;
  importOpId: string;
  trustLevel: TrustLevel;
  itemsProcessed: number;
  commandsApplied: number;
  errors: string[];
}

export interface RunTextIngestionPipelineOptions {
  source: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  from?: number;
  to?: number;
  mode?: "replace" | "insert";
}

const toStructuredBlocks = (blocks: ScreenplayBlock[]): StructuredBlock[] =>
  blocks.map((block) => ({
    type: block.formatId,
    text: block.text,
  }));

export async function runTextIngestionPipeline(
  view: EditorView,
  input: string | ScreenplayBlock[],
  options: RunTextIngestionPipelineOptions
): Promise<IngestionResult> {
  const importOpId = crypto.randomUUID();
  const errors: string[] = [];
  const startedAt = performance.now();

  orchestratorLogger.info("pipeline-started", {
    importOpId,
    source: options.source,
    inputType: typeof input === "string" ? "text" : "blocks",
  });

  try {
    const trustAssessment = assessTrustLevel({
      blocks: typeof input === "string" ? [] : toStructuredBlocks(input),
      source: options.source,
      systemGenerated: options.metadata?.systemGenerated === true,
      integrityChecked: options.metadata?.integrityChecked === true,
    });
    const trustLevel = trustAssessment.level;

    telemetry.recordIngestionStart(importOpId, {
      source: options.source,
      trustLevel,
      inputSize: typeof input === "string" ? input.length : input.length,
    });

    switch (trustLevel) {
      case "trusted_structured":
        return await handleTrustedPath(
          view,
          input as ScreenplayBlock[],
          importOpId,
          options,
          startedAt
        );
      case "semi_structured":
        return await handleSemiTrustedPath(
          view,
          input,
          importOpId,
          options,
          startedAt
        );
      case "raw_text":
      default:
        return await handleRawTextPath(
          view,
          input as string,
          importOpId,
          options,
          startedAt
        );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    telemetry.recordIngestionError(importOpId, errorMsg);
    orchestratorLogger.error("pipeline-failed", {
      importOpId,
      error: errorMsg,
    });

    return {
      success: false,
      importOpId,
      trustLevel: "raw_text",
      itemsProcessed: 0,
      commandsApplied: 0,
      errors,
    };
  }
}

async function handleTrustedPath(
  view: EditorView,
  blocks: ScreenplayBlock[],
  importOpId: string,
  options: RunTextIngestionPipelineOptions,
  startedAt: number
): Promise<IngestionResult> {
  const { screenplayBlocksToHtml } = await import("../utils/file-import");
  const html = screenplayBlocksToHtml(blocks);

  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const domElement = document.createElement("div");
  domElement.innerHTML = html;
  const parsedContent = parser.parse(domElement);

  const tr = view.state.tr;
  const from = options.from ?? 0;
  const to = options.to ?? view.state.doc.content.size;
  tr.replaceWith(from, to, parsedContent);
  view.dispatch(tr);

  telemetry.recordIngestionComplete(importOpId, {
    trustLevel: "trusted_structured",
    itemsProcessed: blocks.length,
    commandsApplied: 0,
    latencyMs: performance.now() - startedAt,
  });

  return {
    success: true,
    importOpId,
    trustLevel: "trusted_structured",
    itemsProcessed: blocks.length,
    commandsApplied: 0,
    errors: [],
  };
}

async function handleSemiTrustedPath(
  view: EditorView,
  input: string | ScreenplayBlock[],
  importOpId: string,
  options: RunTextIngestionPipelineOptions,
  startedAt: number
): Promise<IngestionResult> {
  if (typeof input === "string") {
    return handleRawTextPath(view, input, importOpId, options, startedAt);
  }

  return handleTrustedPath(view, input, importOpId, options, startedAt);
}

async function handleRawTextPath(
  view: EditorView,
  text: string,
  importOpId: string,
  options: RunTextIngestionPipelineOptions,
  startedAt: number
): Promise<IngestionResult> {
  const classified = classifyLines(text);

  const editorInsertion = await import("./editor-insertion");
  await editorInsertion.insertClassifiedItems(
    view,
    classified as ClassifiedItem[],
    {
      from: options.from,
      to: options.to,
    }
  );

  telemetry.recordIngestionComplete(importOpId, {
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
    commandsApplied: 0,
    latencyMs: performance.now() - startedAt,
  });

  return {
    success: true,
    importOpId,
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
    commandsApplied: 0,
    errors: [],
  };
}

export const blocksToLegacyItems = (
  blocks: readonly ScreenplayBlock[]
): ClassifiedItem[] =>
  blocks.map((block, index) => ({
    _itemId: `legacy-${index}`,
    type: toLegacyElementType(block.formatId),
    text: block.text,
    confidence: 1,
    classificationMethod: "external-engine",
  })) as ClassifiedItem[];
