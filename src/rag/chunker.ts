import * as fs from "fs";
import * as path from "path";
import { CodeChunk } from "./types";
import { CHUNK_SIZE, CHUNK_OVERLAP, logger } from "./config";

const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CHUNK_CHARS = CHUNK_SIZE * APPROX_CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP * APPROX_CHARS_PER_TOKEN;

export function chunkFile(filePath: string): CodeChunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);
  const fileType = path.extname(filePath).slice(1);
  const language = getLanguage(fileType);

  if (
    fileType === "ts" ||
    fileType === "tsx" ||
    fileType === "js" ||
    fileType === "jsx"
  ) {
    return chunkCodeFile(content, filePath, fileName, fileType, language);
  } else if (fileType === "md") {
    return chunkMarkdownFile(content, filePath, fileName, fileType, language);
  } else {
    return chunkGenericFile(content, filePath, fileName, fileType, language);
  }
}

function chunkCodeFile(
  content: string,
  filePath: string,
  fileName: string,
  fileType: string,
  language: string
): CodeChunk[] {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  let currentChunk = "";
  let startLine = 1;
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (currentChunk.length + line.length > MAX_CHUNK_CHARS) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            filePath,
            fileName,
            fileType,
            chunkIndex,
            totalChunks: 0,
            language,
            startLine,
            endLine: i,
          },
        });
        chunkIndex++;

        const overlapLines = Math.floor(OVERLAP_CHARS / 80);
        const overlapStart = Math.max(0, i - overlapLines);
        currentChunk = lines.slice(overlapStart, i + 1).join("\n") + "\n";
        startLine = overlapStart + 1;
      }
    } else {
      currentChunk += line + "\n";
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        filePath,
        fileName,
        fileType,
        chunkIndex,
        totalChunks: 0,
        language,
        startLine,
        endLine: lines.length,
      },
    });
  }

  chunks.forEach((chunk, idx) => {
    chunk.metadata.totalChunks = chunks.length;
    chunk.metadata.chunkIndex = idx;
  });

  return chunks;
}

function chunkMarkdownFile(
  content: string,
  filePath: string,
  fileName: string,
  fileType: string,
  language: string
): CodeChunk[] {
  const sections = content.split(/^#{1,6}\s+/m);
  const chunks: CodeChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split("\n");
    const sectionTitle = lines[0]?.trim() || "Untitled Section";

    if (section.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        content: section.trim(),
        metadata: {
          filePath,
          fileName,
          fileType,
          chunkIndex,
          totalChunks: 0,
          section: sectionTitle,
          language,
        },
      });
      chunkIndex++;
    } else {
      const subChunks = splitLargeText(section, MAX_CHUNK_CHARS, OVERLAP_CHARS);
      subChunks.forEach((subChunk) => {
        chunks.push({
          content: subChunk.trim(),
          metadata: {
            filePath,
            fileName,
            fileType,
            chunkIndex,
            totalChunks: 0,
            section: sectionTitle,
            language,
          },
        });
        chunkIndex++;
      });
    }
  }

  chunks.forEach((chunk) => {
    chunk.metadata.totalChunks = chunks.length;
  });

  return chunks;
}

function chunkGenericFile(
  content: string,
  filePath: string,
  fileName: string,
  fileType: string,
  language: string
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const textChunks = splitLargeText(content, MAX_CHUNK_CHARS, OVERLAP_CHARS);

  textChunks.forEach((chunk, idx) => {
    chunks.push({
      content: chunk.trim(),
      metadata: {
        filePath,
        fileName,
        fileType,
        chunkIndex: idx,
        totalChunks: textChunks.length,
        language,
      },
    });
  });

  return chunks;
}

function splitLargeText(
  text: string,
  maxChars: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;

    if (start >= text.length - overlap) break;
  }

  return chunks;
}

function getLanguage(fileType: string): string {
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    md: "markdown",
    json: "json",
    css: "css",
    html: "html",
    py: "python",
  };

  return languageMap[fileType] || "text";
}

export function getAllCodeFiles(rootDir: string): string[] {
  const files: string[] = [];
  const excludeDirs = [
    "node_modules",
    "dist",
    "build",
    ".git",
    "coverage",
    "test-results",
  ];
  const includeExtensions = [".ts", ".tsx", ".js", ".jsx", ".md"];

  function traverse(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          traverse(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (includeExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(rootDir);
  logger.info(`Found ${files.length} code files to index`);
  return files;
}
