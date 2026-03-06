declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
    messages?: Array<{ message: string }>;
  }

  export function extractRawText(input: {
    path?: string;
    buffer?: Uint8Array | ArrayBuffer | unknown;
    arrayBuffer?: ArrayBuffer;
  }): Promise<ExtractRawTextResult>;

  const mammothDefault: {
    extractRawText: typeof extractRawText;
  };
  export default mammothDefault;
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
      }>;
      destroy?: () => Promise<void>;
    }>;
    destroy: () => Promise<void>;
  };
}
