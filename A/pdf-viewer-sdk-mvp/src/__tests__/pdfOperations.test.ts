/**
 * Pure-function tests for src/utils/pdfOperations.ts.
 *
 * We avoid PDF.js entirely here - pdf-lib both creates the synthetic input
 * documents and verifies the output by re-parsing. These tests run under
 * Node (see vite.config.ts `test.environment === "node"`).
 */

import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import {
  createBlankPdfBytes,
  deletePages,
  extractPages,
  getPageCount,
  mergePdfs,
  reorderPages,
  rotatePages,
  setPageRotations,
} from "../utils/pdfOperations";

async function rotationOf(bytes: Uint8Array, idx: number): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages()[idx].getRotation().angle;
}

describe("pdfOperations", () => {
  it("createBlankPdfBytes returns a document with the requested page count", async () => {
    const bytes = await createBlankPdfBytes(4);
    expect(await getPageCount(bytes)).toBe(4);
  });

  it("deletePages removes the requested pages", async () => {
    const bytes = await createBlankPdfBytes(5);
    const result = await deletePages(bytes, [0, 2, 4]);
    expect(await getPageCount(result)).toBe(2);
  });

  it("deletePages refuses to delete every page", async () => {
    const bytes = await createBlankPdfBytes(2);
    await expect(deletePages(bytes, [0, 1])).rejects.toThrow();
  });

  it("extractPages produces a document with only the selected pages", async () => {
    const bytes = await createBlankPdfBytes(6);
    const result = await extractPages(bytes, [1, 3, 5]);
    expect(await getPageCount(result)).toBe(3);
  });

  it("extractPages throws when nothing is selected", async () => {
    const bytes = await createBlankPdfBytes(3);
    await expect(extractPages(bytes, [])).rejects.toThrow();
  });

  it("mergePdfs concatenates documents in order", async () => {
    const a = await createBlankPdfBytes(2);
    const b = await createBlankPdfBytes(3);
    const merged = await mergePdfs(a, b);
    expect(await getPageCount(merged)).toBe(5);
  });

  it("reorderPages requires a full permutation", async () => {
    const bytes = await createBlankPdfBytes(3);
    await expect(reorderPages(bytes, [0, 1])).rejects.toThrow();
  });

  it("reorderPages preserves the page count", async () => {
    const bytes = await createBlankPdfBytes(4);
    const result = await reorderPages(bytes, [3, 0, 2, 1]);
    expect(await getPageCount(result)).toBe(4);
  });

  it("rotatePages applies the requested delta", async () => {
    const bytes = await createBlankPdfBytes(2);
    const r = await rotatePages(bytes, [0], 90);
    expect(await rotationOf(r, 0)).toBe(90);
    expect(await rotationOf(r, 1)).toBe(0);
  });

  it("rotatePages normalizes negative rotations", async () => {
    const bytes = await createBlankPdfBytes(1);
    const r = await rotatePages(bytes, [0], -90);
    expect(await rotationOf(r, 0)).toBe(270);
  });

  it("setPageRotations sets absolute rotations", async () => {
    const bytes = await createBlankPdfBytes(3);
    const r = await setPageRotations(bytes, { 0: 90, 2: 180 });
    expect(await rotationOf(r, 0)).toBe(90);
    expect(await rotationOf(r, 1)).toBe(0);
    expect(await rotationOf(r, 2)).toBe(180);
  });

  it("rotation stacks correctly across two rotate calls", async () => {
    let bytes = await createBlankPdfBytes(1);
    bytes = await rotatePages(bytes, [0], 90);
    bytes = await rotatePages(bytes, [0], 180);
    expect(await rotationOf(bytes, 0)).toBe(270);
  });

  it("preserves pre-existing rotations on untouched pages", async () => {
    const src = await PDFDocument.create();
    const a = src.addPage([612, 792]);
    const b = src.addPage([612, 792]);
    a.setRotation(degrees(90));
    b.setRotation(degrees(180));
    const bytes = await src.save();

    const result = await rotatePages(bytes, [0], 90);
    expect(await rotationOf(result, 0)).toBe(180);
    expect(await rotationOf(result, 1)).toBe(180);
  });
});
