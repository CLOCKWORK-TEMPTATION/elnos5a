export type BBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TextItem = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  fontName?: string;
  dir?: "ltr" | "rtl" | "ttb";
};

export type ExtractedLine = {
  id: string;
  page: number;
  lineNoOnPage: number;
  text: string;
  source: "text-layer" | "ocr" | "patched";
  bbox?: BBox;
  items?: TextItem[];
  quality: LineQuality;
  flags: string[];
};

export type LineQuality = {
  score: number; // 0..1
  reasons: string[];
  weirdCharRatio: number;
  arabicRatio: number;
  digitRatio: number;
  punctuationRatio: number;
  hasBrokenArabicPattern: boolean;
  suspiciousDialoguePattern: boolean;
  probableArtifact: boolean;
};

export type PageExtraction = {
  page: number;
  width?: number;
  height?: number;
  lines: ExtractedLine[];
  rawTextItemsCount: number;
  usedOcr: boolean;
};

export type DocumentExtraction = {
  pages: PageExtraction[];
  metadata: {
    filePath: string;
    pageCount: number;
    strategy: "text-layer-first";
    startedAt: string;
    finishedAt?: string;
  };
  stats: PipelineStats;
};

export type PipelineStats = {
  pagesTotal: number;
  pagesWithTextLayer: number;
  pagesSentToOcr: number;
  linesTotalBeforePatch: number;
  suspiciousLinesBeforePatch: number;
  patchedLines: number;
  suspiciousLinesAfterPatch: number;
};

export type OcrPageResult = {
  page: number;
  text: string;
  lines?: string[];
};

export interface OcrProvider {
  name: string;
  processPdfPages(input: {
    pdfBuffer: Buffer;
    pages: number[]; // 0-based
    hint?: string;
  }): Promise<OcrPageResult[]>;
}

export type PipelineConfig = {
  lineMerge: {
    yTolerance: number;
    xGapMergeThreshold: number;
    minSpaceInsertGap: number;
  };
  quality: {
    suspiciousThreshold: number;
    weirdCharRatioThreshold: number;
    minArabicRatioForArabicDocs: number;
  };
  ocr: {
    enabled: boolean;
    provider: "mistral" | "azure" | "none";
    maxPagesPerBatch: number;
  };
  patch: {
    maxEditDistanceRatio: number;
    requireSameLineCountWindow: boolean;
    windowSize: number;
  };
  domain: {
    screenplayArabicMode: boolean;
  };
};
