declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  };

  type PdfParseOptions = {
    pagerender?: (pageData: any) => string | Promise<string>;
    max?: number;
    version?: string;
  };

  function pdfParse(dataBuffer: Buffer | Uint8Array, options?: PdfParseOptions): Promise<PdfParseResult>;

  export = pdfParse;
}
