/**
 * Compare benchmark results against a baseline.
 * Usage: node scripts/compare-bench.mjs <current.json> [baseline.json]
 *
 * Exit code 1 if any benchmark regresses by more than 30%.
 * If no baseline provided, just prints current results.
 *
 * Expected JSON format: Vitest bench output (--reporter=json).
 * The script walks the `testResults` array and extracts `benchmarkResults`
 * entries, each of which carries a `mean` duration in milliseconds.
 *
 * Vitest bench JSON shape (simplified):
 * {
 *   "testResults": [
 *     {
 *       "testFilePath": "...",
 *       "benchmarkResults": [
 *         { "name": "analyze 100 lines", "mean": 1.23, "p99": 2.0, ... }
 *       ]
 *     }
 *   ]
 * }
 */

import { readFileSync, existsSync } from "node:fs";

const THRESHOLD = 0.3; // 30% regression threshold

// ─── CLI args ─────────────────────────────────────────────────────────────────

const currentPath = process.argv[2];
const baselinePath = process.argv[3];

if (!currentPath) {
  console.error(
    "Usage: node scripts/compare-bench.mjs <current.json> [baseline.json]"
  );
  process.exit(1);
}

if (!existsSync(currentPath)) {
  console.error(
    `[compare-bench] ERROR: current file not found: ${currentPath}`
  );
  process.exit(1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, mean: number }} BenchmarkEntry
 * @typedef {{ benchmarkResults?: BenchmarkEntry[] }} TestFileResult
 * @typedef {{ testResults: TestFileResult[] }} BenchReport
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a Vitest bench JSON file and return a flat map of
 * benchmark name → mean duration (ms).
 *
 * @param {string} filePath
 * @returns {Map<string, number>}
 */
function parseBenchFile(filePath) {
  /** @type {string} */
  const raw = readFileSync(filePath, "utf-8");

  /** @type {BenchReport} */
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error(
      `[compare-bench] ERROR: failed to parse JSON from ${filePath}`
    );
    process.exit(1);
  }

  /** @type {Map<string, number>} */
  const map = new Map();

  if (!Array.isArray(report.testResults)) {
    console.warn(
      `[compare-bench] WARN: no "testResults" array found in ${filePath}`
    );
    return map;
  }

  for (const fileResult of report.testResults) {
    const benchmarks = fileResult.benchmarkResults;
    if (!Array.isArray(benchmarks)) continue;

    for (const entry of benchmarks) {
      if (typeof entry.name === "string" && typeof entry.mean === "number") {
        map.set(entry.name, entry.mean);
      }
    }
  }

  return map;
}

/**
 * Format a duration in milliseconds to a readable string.
 *
 * @param {number} ms
 * @returns {string}
 */
function fmtMs(ms) {
  return `${ms.toFixed(4)} ms`;
}

/**
 * Format a regression percentage for display.
 *
 * @param {number} ratio  e.g. 0.35 means 35% slower
 * @returns {string}
 */
function fmtPct(ratio) {
  const sign = ratio >= 0 ? "+" : "";
  return `${sign}${(ratio * 100).toFixed(1)}%`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const current = parseBenchFile(currentPath);

if (current.size === 0) {
  console.warn(
    "[compare-bench] WARN: no benchmark entries found in current file."
  );
}

// Print current results
console.log("\n── Current benchmark results ──────────────────────────────");
for (const [name, mean] of current) {
  console.log(`  ${name.padEnd(40)} ${fmtMs(mean)}`);
}

// If no baseline, just exit cleanly
if (!baselinePath) {
  console.log(
    "\n[compare-bench] No baseline provided — nothing to compare against."
  );
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(
    `[compare-bench] ERROR: baseline file not found: ${baselinePath}`
  );
  process.exit(1);
}

const baseline = parseBenchFile(baselinePath);

console.log("\n── Comparison against baseline ────────────────────────────");

let hasRegression = false;

for (const [name, currentMean] of current) {
  const baselineMean = baseline.get(name);

  if (baselineMean === undefined) {
    console.log(
      `  [NEW]  ${name}  →  ${fmtMs(currentMean)}  (no baseline entry)`
    );
    continue;
  }

  // ratio > 0  → slower (regression)
  // ratio < 0  → faster (improvement)
  const ratio = (currentMean - baselineMean) / baselineMean;

  const direction = ratio > 0 ? "SLOWER" : "FASTER";
  const line = `  ${name.padEnd(40)} baseline=${fmtMs(baselineMean)}  current=${fmtMs(currentMean)}  ${direction} ${fmtPct(ratio)}`;

  if (ratio > THRESHOLD) {
    console.error(`  [FAIL] ${line}`);
    hasRegression = true;
  } else if (ratio > 0) {
    console.warn(`  [WARN] ${line}`);
  } else {
    console.log(`  [OK]   ${line}`);
  }
}

// Report any baseline entries missing from current
for (const [name] of baseline) {
  if (!current.has(name)) {
    console.warn(
      `  [GONE] ${name}  (present in baseline, missing from current)`
    );
  }
}

console.log("");

if (hasRegression) {
  console.error(
    `[compare-bench] FAIL: one or more benchmarks regressed by more than ${(THRESHOLD * 100).toFixed(0)}%.`
  );
  process.exit(1);
} else {
  console.log("[compare-bench] OK: no regressions detected.");
  process.exit(0);
}
