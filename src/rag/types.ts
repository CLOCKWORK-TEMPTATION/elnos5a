export interface CodeChunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  filePath: string;
  fileName: string;
  fileType: string;
  chunkIndex: number;
  totalChunks: number;
  functionName?: string;
  className?: string;
  section?: string;
  language: string;
  startLine?: number;
  endLine?: number;
}

export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  id: string | number;
}

export interface RagResponse {
  answer: string;
  sources: Array<{
    filePath: string;
    snippet: string;
    score: number;
  }>;
}
