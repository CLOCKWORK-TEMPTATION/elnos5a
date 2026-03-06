import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { runVisionCompare } from "./pdf-vision-compare.mjs";
import { runVisionJudge } from "./pdf-vision-judge.mjs";

const log = (tag, data) => {
  const ts = new Date().toISOString();
  console.warn(
    `[${ts}] [pdf-ref] ${tag}`,
    data != null ? JSON.stringify(data) : ""
  );
};

const execFileAsync = promisify(execFile);
const PDFTOPPM_BINARY =
  process.platform === "win32" ? "pdftoppm.exe" : "pdftoppm";
const PDFTOPPM_CHECK_TIMEOUT_MS = 10_000;
const PDFTOPPM_CHECK_BUFFER = 8 * 1024 * 1024;

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error ?? "unknown error");

const hasPdftoppmHint = (value) =>
  typeof value === "string" && /pdftoppm|poppler/iu.test(value);

const buildMissingRendererMessage = (command) =>
  `PDF vision misconfigured: pdftoppm is required to render page images (command: ${command}).`;

const buildUnusableRendererMessage = (command, reason) =>
  `PDF vision misconfigured: pdftoppm command is not usable (command: ${command}). ${reason}`;

export const resolvePdftoppmCommand = () => {
  const popplerBin = process.env.POPPLER_BIN?.trim();
  if (popplerBin) {
    return join(popplerBin, PDFTOPPM_BINARY);
  }
  return PDFTOPPM_BINARY;
};

export const probePdftoppmDependency = async () => {
  const command = resolvePdftoppmCommand();

  try {
    await execFileAsync(command, ["-v"], {
      timeout: PDFTOPPM_CHECK_TIMEOUT_MS,
      maxBuffer: PDFTOPPM_CHECK_BUFFER,
    });

    return {
      available: true,
      command,
    };
  } catch (error) {
    // On some platforms `pdftoppm -v` may return non-zero despite command availability.
    if (
      typeof error?.code === "number" &&
      (hasPdftoppmHint(error?.stdout) || hasPdftoppmHint(error?.stderr))
    ) {
      return {
        available: true,
        command,
      };
    }

    const spawnCode = typeof error?.code === "string" ? error.code : "";
    if (spawnCode === "ENOENT") {
      return {
        available: false,
        command,
        errorCode: "PDF_OCR_PDF_RENDERER_MISSING",
        errorMessage: buildMissingRendererMessage(command),
      };
    }

    return {
      available: false,
      command,
      errorCode: "PDF_OCR_PDF_RENDERER_UNUSABLE",
      errorMessage: buildUnusableRendererMessage(
        command,
        toErrorMessage(error)
      ),
    };
  }
};

const tokenize = (line) => {
  const tokens = String(line ?? "").match(/[\p{L}\p{N}_]+|[^\s]/gu);
  return Array.isArray(tokens) ? tokens : [];
};

const normalizeText = (text) =>
  String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

const parseOcrPages = (raw) => {
  const payload = JSON.parse(String(raw ?? "{}"));
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  return pages
    .filter(
      (page) =>
        page &&
        typeof page === "object" &&
        typeof page.index === "number" &&
        typeof page.markdown === "string"
    )
    .sort((a, b) => a.index - b.index)
    .map((page) => ({
      index: Number(page.index),
      text: String(page.markdown).trim(),
    }));
};

const ensurePdftoppmAvailable = async () => {
  const probe = await probePdftoppmDependency();
  if (!probe.available) {
    throw new Error(`[${probe.errorCode}] ${probe.errorMessage}`);
  }
  return probe.command;
};

const sortPngPages = (files, prefixBaseName) =>
  files
    .filter(
      (name) =>
        name.startsWith(prefixBaseName) &&
        name.toLowerCase().endsWith(".png") &&
        /-\d+\.png$/u.test(name)
    )
    .sort((a, b) => {
      const ai = Number(a.match(/-(\d+)\.png$/u)?.[1] ?? "0");
      const bi = Number(b.match(/-(\d+)\.png$/u)?.[1] ?? "0");
      return ai - bi;
    });

export const renderPdfPages = async ({ pdfPath, dpi }) => {
  log("render-start", { pdfPath, dpi });
  const t0 = Date.now();
  const pdftoppmCommand = await ensurePdftoppmAvailable();
  const renderRoot = await mkdtemp(join(tmpdir(), "mo7rer-pdf-vision-"));
  const prefix = join(renderRoot, "page");

  await execFileAsync(
    pdftoppmCommand,
    ["-png", "-r", String(dpi), resolve(pdfPath), prefix],
    { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 }
  );

  const files = await readdir(renderRoot);
  const sorted = sortPngPages(files, basename(prefix));
  if (sorted.length === 0) {
    throw new Error(
      "[PDF_OCR_PDF_RENDERER_EMPTY_OUTPUT] PDF vision renderer produced no page images."
    );
  }

  log("render-done", { pages: sorted.length, ms: Date.now() - t0 });
  return sorted.map((name) => join(renderRoot, name));
};

const _renderFirstPdfPage = async ({ pdfPath, dpi }) => {
  const pdftoppmCommand = await ensurePdftoppmAvailable();
  const renderRoot = await mkdtemp(join(tmpdir(), "mo7rer-pdf-vision-probe-"));
  const prefix = join(renderRoot, "probe");

  await execFileAsync(
    pdftoppmCommand,
    [
      "-png",
      "-singlefile",
      "-f",
      "1",
      "-l",
      "1",
      "-r",
      String(dpi),
      resolve(pdfPath),
      prefix,
    ],
    { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
  );

  const files = await readdir(renderRoot);
  const firstPng = files.find((name) => name.toLowerCase().endsWith(".png"));
  if (!firstPng) {
    throw new Error(
      "[PDF_OCR_VISION_PREFLIGHT_RENDER_FAILED] Vision preflight failed: unable to render first page image."
    );
  }

  return {
    renderRoot,
    imagePath: join(renderRoot, firstPng),
  };
};

const applyPatchToPageText = (pageText, patch) => {
  const lines = normalizeText(pageText).split("\n");
  const lineIndex = Math.max(0, Number(patch.line) - 1);
  const line = lines[lineIndex] ?? "";
  const tokens = tokenize(line);
  const tokenIndex = Math.max(0, Number(patch.tokenIndex));

  if (patch.operation === "replace") {
    tokens[tokenIndex] = String(patch.expected ?? "");
  } else if (patch.operation === "insert") {
    tokens.splice(tokenIndex, 0, String(patch.expected ?? ""));
  } else if (patch.operation === "delete") {
    if (tokenIndex < tokens.length) {
      tokens.splice(tokenIndex, 1);
    }
  }

  lines[lineIndex] = tokens.join(" ").trim();
  return lines.join("\n");
};

const buildPageLineBoundaries = (pages) => {
  const boundaries = [];
  let acc = 0;
  for (const page of pages) {
    const count = normalizeText(page.text).split("\n").length;
    acc += count;
    boundaries.push(acc);
  }
  return boundaries;
};

// verifyVisionModelCapabilities removed — preflight is no longer needed.
// Models are verified implicitly during the actual compare/judge runs.

export const buildPdfReference = async ({
  pdfPath,
  ocrJsonPath,
  externalReferencePath,
  compare,
  judge,
  renderDpi = 300,
  visionPreflightDone: _visionPreflightDone = false,
}) => {
  if (externalReferencePath) {
    const referenceText = await readFile(
      resolve(externalReferencePath),
      "utf-8"
    );
    return {
      referenceMode: "external",
      referenceText,
      pageLineBoundaries: [],
      compareReport: {
        renderedPages: 0,
        proposedPatches: 0,
        approvedPatches: 0,
        rejectedPatches: 0,
      },
    };
  }

  log("build-ref-start", { pdfPath, ocrJsonPath, renderDpi });
  const tTotal = Date.now();

  const ocrJsonRaw = await readFile(ocrJsonPath, "utf-8");
  const ocrPages = parseOcrPages(ocrJsonRaw);
  if (ocrPages.length === 0) {
    throw new Error(
      "Cannot build pdf-vision reference: OCR pages are missing."
    );
  }
  log("ocr-pages-parsed", { count: ocrPages.length });

  const pageImages = await renderPdfPages({ pdfPath, dpi: renderDpi });

  log("vision-compare-start", {
    pages: pageImages.length,
    model: compare.model,
  });
  const tCompare = Date.now();
  const compareResult = await runVisionCompare({
    apiKey: compare.apiKey,
    model: compare.model,
    pageImages,
    ocrPages,
    timeoutMs: compare.timeoutMs,
  });
  log("vision-compare-done", {
    patches: compareResult.proposedPatchCount,
    ms: Date.now() - tCompare,
  });

  log("vision-judge-start", {
    pages: compareResult.pages.length,
    model: judge.model,
  });
  const tJudge = Date.now();
  const judgeResult = await runVisionJudge({
    apiKey: judge.apiKey,
    model: judge.model,
    comparePages: compareResult.pages,
    timeoutMs: judge.timeoutMs,
    skipPreflight: true,
  });
  log("vision-judge-done", {
    approved: judgeResult.approvedPatches.length,
    rejected: judgeResult.rejectedPatches.length,
    ms: Date.now() - tJudge,
  });

  const patchedPages = compareResult.pages.map((item) => ({
    page: item.page,
    text: item.referencePageText,
  }));
  const pageByNumber = new Map(patchedPages.map((page) => [page.page, page]));

  for (const patch of judgeResult.approvedPatches) {
    const page = pageByNumber.get(Number(patch.page));
    if (!page) continue;
    page.text = applyPatchToPageText(page.text, patch);
  }

  const referenceText = patchedPages
    .sort((a, b) => a.page - b.page)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  log("build-ref-done", {
    totalMs: Date.now() - tTotal,
    renderedPages: pageImages.length,
    proposed: compareResult.proposedPatchCount,
    approved: judgeResult.approvedPatches.length,
    rejected: judgeResult.rejectedPatches.length,
  });

  return {
    referenceMode: "pdf-vision",
    referenceText,
    pageLineBoundaries: buildPageLineBoundaries(
      patchedPages.sort((a, b) => a.page - b.page)
    ),
    compareReport: {
      renderedPages: pageImages.length,
      proposedPatches: compareResult.proposedPatchCount,
      approvedPatches: judgeResult.approvedPatches.length,
      rejectedPatches: judgeResult.rejectedPatches.length,
    },
  };
};
