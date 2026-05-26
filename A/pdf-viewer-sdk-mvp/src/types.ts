/**
 * Shared type definitions for the PDF Viewer SDK.
 *
 * State is kept simple and serializable where possible. The authoritative
 * PDF document is the in-memory `Uint8Array` (currentPdfBytes); rendering
 * is driven by a derived `pdfDocProxy` produced by PDF.js.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

export type ViewMode = "view" | "edit";

export type PageMode = "continuous" | "single";

export type FitMode = "none" | "width" | "page";

export type Rotation = 0 | 90 | 180 | 270;

export interface PdfDocumentState {
  /** Original File chosen by the user (kept for original filename). */
  originalFile: File | null;
  /** Current bytes - replaced after every edit so the proxy stays in sync. */
  currentPdfBytes: Uint8Array | null;
  /** PDF.js proxy derived from currentPdfBytes. */
  pdfDocProxy: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  /** 0..1 progress while bytes/pdf are loading, or null when idle. */
  progress: number | null;
  error: string | null;
}
