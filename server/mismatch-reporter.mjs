import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const toSafeNumber = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const summarizeMismatchReport = (report) => {
  const rows = Array.isArray(report) ? report : [];
  const critical = rows.filter((row) => row?.severity === "critical").length;
  const normal = rows.length - critical;

  return {
    total: rows.length,
    critical,
    normal,
  };
};

export const writeMismatchReport = async (filePath, payload) => {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("mismatch report path is required.");
  }

  const serialized = {
    generatedAt: new Date().toISOString(),
    payloadVersion: toSafeNumber(payload?.payloadVersion, 2),
    status:
      typeof payload?.status === "string" && payload.status
        ? payload.status
        : "unknown",
    referenceMode:
      typeof payload?.referenceMode === "string" && payload.referenceMode
        ? payload.referenceMode
        : "unknown",
    quality: payload?.quality ?? null,
    mismatchSummary: summarizeMismatchReport(payload?.mismatchReport),
    mismatchReport: Array.isArray(payload?.mismatchReport)
      ? payload.mismatchReport
      : [],
    rejectionReason:
      typeof payload?.rejectionReason === "string"
        ? payload.rejectionReason
        : undefined,
    attempts: Array.isArray(payload?.attempts) ? payload.attempts : [],
  };

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(serialized, null, 2)}\n`,
    "utf-8"
  );
};
