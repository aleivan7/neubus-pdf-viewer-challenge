/**
 * Pure-ish helpers for mutating PDFs using pdf-lib.
 *
 * Every function takes raw bytes (Uint8Array), performs the requested
 * operation on a fresh PDFDocument, and returns new bytes. Returning new
 * bytes keeps callers simple: replace `currentPdfBytes` in state and the
 * usePdfDocument hook will rebuild the PDF.js proxy.
 *
 * `pageIndices` arguments are always 0-based.
 */

import { PDFDocument, degrees } from "pdf-lib";
import type { Rotation } from "../types";

/** Load a PDFDocument from bytes (helper to keep ignoreEncryption consistent). */
async function loadDoc(bytes: Uint8Array): Promise<PDFDocument> {
  // ignoreEncryption=true lets us at least try to display password-free
  // copies of "owner-encrypted" PDFs (very common). Truly encrypted docs
  // will still fail at parse time, which we surface to the user.
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

/** Rotate the given pages by `deltaDegrees` (multiple of 90) relative to current. */
export async function rotatePages(
  bytes: Uint8Array,
  pageIndices: number[],
  deltaDegrees: 90 | -90 | 180
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes);
  const pages = doc.getPages();
  for (const idx of pageIndices) {
    const page = pages[idx];
    if (!page) continue;
    const current = page.getRotation().angle;
    // Normalize into [0, 360) and clamp to valid PDF rotation values.
    const next = (((current + deltaDegrees) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  }
  return doc.save();
}

/** Set absolute rotations for the given pages. */
export async function setPageRotations(
  bytes: Uint8Array,
  rotations: Record<number, Rotation>
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes);
  const pages = doc.getPages();
  for (const [key, angle] of Object.entries(rotations)) {
    const idx = Number(key);
    const page = pages[idx];
    if (!page) continue;
    page.setRotation(degrees(angle));
  }
  return doc.save();
}

/** Remove the given pages. No-op if `pageIndices` is empty or invalid. */
export async function deletePages(
  bytes: Uint8Array,
  pageIndices: number[]
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes);
  const total = doc.getPageCount();
  // Sort descending so removals don't shift subsequent indices.
  const sorted = [...new Set(pageIndices)]
    .filter((i) => i >= 0 && i < total)
    .sort((a, b) => b - a);
  // pdf-lib refuses to leave a document with zero pages. Guard against it.
  if (sorted.length >= total) {
    throw new Error("Cannot delete every page of the document.");
  }
  for (const idx of sorted) {
    doc.removePage(idx);
  }
  return doc.save();
}

/**
 * Reorder the document according to `newOrder`, which must be a permutation
 * of [0..pageCount-1]. Implemented by copying pages into a fresh document
 * in the requested order - pdf-lib has no in-place reorder API.
 */
export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[]
): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  const total = src.getPageCount();
  if (newOrder.length !== total) {
    throw new Error(
      `Reorder length ${newOrder.length} does not match page count ${total}.`
    );
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, newOrder);
  for (const p of copied) out.addPage(p);
  return out.save();
}

/** Append `additionalBytes` after every page of the current document. */
export async function mergePdfs(
  bytes: Uint8Array,
  additionalBytes: Uint8Array
): Promise<Uint8Array> {
  const base = await loadDoc(bytes);
  const extra = await loadDoc(additionalBytes);
  const copied = await base.copyPages(extra, extra.getPageIndices());
  for (const p of copied) base.addPage(p);
  return base.save();
}

/** Build a new PDF containing only the selected pages, in the given order. */
export async function extractPages(
  bytes: Uint8Array,
  pageIndices: number[]
): Promise<Uint8Array> {
  if (pageIndices.length === 0) {
    throw new Error("Select at least one page to extract.");
  }
  const src = await loadDoc(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageIndices);
  for (const p of copied) out.addPage(p);
  return out.save();
}

/** Return the page count by parsing the bytes (used by tests). */
export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await loadDoc(bytes);
  return doc.getPageCount();
}

/**
 * Build a minimal test PDF with `pageCount` blank pages.
 * Exposed for unit tests; not used by the runtime UI.
 */
export async function createBlankPdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792]);
  return doc.save();
}
