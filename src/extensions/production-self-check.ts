import { classifyText } from "./paste-classifier";
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

let hasExecutedSelfCheck = false;
let lastReport: ProductionSelfCheckReport | null = null;
let inFlightSelfCheck: Promise<ProductionSelfCheckReport> | null = null;

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const runExtensionChecks = (sampleText: string): number => {
  const classified = classifyText(sampleText);
  if (classified.length === 0) {
    throw new Error("Classification returned no lines.");
  }
  return 1;
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

    try {
      extensionFunctionsExecuted += runExtensionChecks(sampleText);
    } catch (error) {
      failures.push({ name: "classification", message: safeMessage(error) });
    }

    const report: ProductionSelfCheckReport = {
      trigger: options.trigger,
      executedFunctions: extensionFunctionsExecuted,
      failedFunctions: failures.length,
      uiFunctionsExecuted: 0,
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
