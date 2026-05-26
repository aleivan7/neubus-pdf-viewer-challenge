/**
 * Centralized PDF.js setup.
 *
 * pdfjs-dist v4 ships its worker as an ESM module (`pdf.worker.min.mjs`).
 * Vite's `?worker` import bundles it as a dedicated module worker so dev and
 * production builds load it reliably (avoids fake-worker dynamic import failures).
 */

import * as pdfjsLib from "pdfjs-dist";
import PdfWorkerModule from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

/** Create a dedicated PDF.js worker for one document load / parse cycle. */
export function createPdfWorker(): InstanceType<typeof pdfjsLib.PDFWorker> {
  const port = new PdfWorkerModule();
  return pdfjsLib.PDFWorker.fromPort({ port });
}

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
