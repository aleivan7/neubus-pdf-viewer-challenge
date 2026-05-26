/**
 * Centralized PDF.js setup.
 *
 * pdfjs-dist v4 ships its worker as an ESM module (`pdf.worker.min.mjs`).
 * Vite's `?url` import returns a hashed asset URL that works in dev and in
 * production builds. Doing this in one place keeps every consumer in sync.
 */

import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a URL pointing at the bundled worker file.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
