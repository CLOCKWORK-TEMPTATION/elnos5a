const CRITICAL_DEFAULT_PATTERNS = [
  /^مشهد[0-9٠-٩]+$/u,
  /^قطع$/u,
  /^(داخلي|خارجي|نهار|ليل|صباح|مساء|فجر)$/u,
  /^[0-9٠-٩]+$/u,
];

const toNormalizedLines = (text) =>
  String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim());

const tokenize = (line) => {
  const src = String(line ?? "").trim();
  if (!src) return [];
  const tokens = src.match(/[\p{L}\p{N}_]+|[^\s]/gu);
  return Array.isArray(tokens) ? tokens : [];
};

const toPageFromLine = (lineNumber, boundaries) => {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return 1;
  for (let i = 0; i < boundaries.length; i += 1) {
    if (lineNumber <= boundaries[i]) {
      return i + 1;
    }
  }
  return boundaries.length;
};

const buildCriticalMatchers = (criticalTokens = []) => {
  const set = new Set(
    (Array.isArray(criticalTokens) ? criticalTokens : [])
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim())
  );

  return {
    isCritical(token) {
      const normalized = String(token ?? "").trim();
      if (!normalized) return false;
      if (set.has(normalized)) return true;
      return CRITICAL_DEFAULT_PATTERNS.some((pattern) =>
        pattern.test(normalized)
      );
    },
  };
};

const toPercent = (value) => Math.round(value * 10000) / 100;

const computeStructuralMatch = (referenceLines, candidateLines) => {
  const maxLen = Math.max(referenceLines.length, candidateLines.length, 1);
  let same = 0;
  for (let i = 0; i < maxLen; i += 1) {
    if ((referenceLines[i] ?? "") === (candidateLines[i] ?? "")) {
      same += 1;
    }
  }
  return toPercent(same / maxLen);
};

export const enforceTokenMatch = ({
  candidateText,
  referenceText,
  pageLineBoundaries,
  criticalTokens,
  minWordMatch = 99.5,
}) => {
  const referenceLines = toNormalizedLines(referenceText);
  const candidateLines = toNormalizedLines(candidateText);
  const critical = buildCriticalMatchers(criticalTokens);

  const maxLines = Math.max(referenceLines.length, candidateLines.length);
  const mismatchReport = [];

  let matchedWords = 0;
  let totalReferenceWords = 0;

  for (let lineIndex = 0; lineIndex < maxLines; lineIndex += 1) {
    const expectedLine = referenceLines[lineIndex] ?? "";
    const actualLine = candidateLines[lineIndex] ?? "";

    const expectedTokens = tokenize(expectedLine);
    const actualTokens = tokenize(actualLine);
    totalReferenceWords += expectedTokens.length;

    const maxTokens = Math.max(expectedTokens.length, actualTokens.length);
    for (let tokenIndex = 0; tokenIndex < maxTokens; tokenIndex += 1) {
      const expectedToken = expectedTokens[tokenIndex] ?? "";
      const actualToken = actualTokens[tokenIndex] ?? "";

      if (expectedToken && actualToken && expectedToken === actualToken) {
        matchedWords += 1;
        continue;
      }

      if (!expectedToken && !actualToken) {
        continue;
      }

      mismatchReport.push({
        page: toPageFromLine(lineIndex + 1, pageLineBoundaries),
        line: lineIndex + 1,
        token: expectedToken || actualToken,
        expected: expectedToken,
        actual: actualToken,
        severity:
          critical.isCritical(expectedToken) || critical.isCritical(actualToken)
            ? "critical"
            : "normal",
      });
    }
  }

  const wordMatch =
    totalReferenceWords === 0
      ? 100
      : toPercent(matchedWords / totalReferenceWords);
  const structuralMatch = computeStructuralMatch(
    referenceLines,
    candidateLines
  );
  const criticalCount = mismatchReport.filter(
    (item) => item.severity === "critical"
  ).length;
  const accepted = wordMatch >= minWordMatch && criticalCount === 0;

  let rejectionReason;
  if (!accepted) {
    if (criticalCount > 0) {
      rejectionReason = `critical mismatches detected (${criticalCount}).`;
    } else {
      rejectionReason = `wordMatch ${wordMatch.toFixed(
        2
      )}% is below threshold ${Number(minWordMatch).toFixed(2)}%.`;
    }
  }

  return {
    quality: {
      wordMatch,
      structuralMatch,
      accepted,
    },
    mismatchReport,
    status: accepted ? "accepted" : "rejected",
    rejectionReason,
  };
};
