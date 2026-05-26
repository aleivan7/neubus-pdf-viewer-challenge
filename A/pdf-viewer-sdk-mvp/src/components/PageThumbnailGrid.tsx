/**
 * PageThumbnailGrid
 *
 * Renders a low-resolution thumbnail per page in editor mode. Pages can be
 * clicked to toggle selection, or shift-clicked to extend the last range.
 *
 * Thumbnails are cached by `pageIndex` keys and re-render only when the
 * underlying proxy or display rotation changes. Render tasks are cancelled
 * on unmount/update to keep PDF.js workers free.
 */

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "../utils/pdfjs";
import type { Rotation } from "../types";

interface PageThumbnailGridProps {
  pdfDocProxy: PDFDocumentProxy;
  /** Source page indices in the order they should be displayed. */
  displayOrder: number[];
  pageRotations: Record<number, Rotation>;
  selectedPages: ReadonlySet<number>;
  onToggleSelect: (displayIndex: number, shiftKey: boolean) => void;
}

const THUMB_TARGET_WIDTH = 160;

export function PageThumbnailGrid({
  pdfDocProxy,
  displayOrder,
  pageRotations,
  selectedPages,
  onToggleSelect,
}: PageThumbnailGridProps) {
  return (
    <div className="thumbs" role="listbox" aria-label="Page thumbnails" aria-multiselectable>
      {displayOrder.map((sourcePageIndex, displayIndex) => (
        <Thumbnail
          key={`${sourcePageIndex}-${pageRotations[sourcePageIndex] ?? 0}`}
          pdfDocProxy={pdfDocProxy}
          pageIndex={sourcePageIndex}
          displayIndex={displayIndex}
          displayRotation={pageRotations[sourcePageIndex] ?? 0}
          selected={selectedPages.has(displayIndex)}
          onToggle={onToggleSelect}
        />
      ))}
    </div>
  );
}

interface ThumbnailProps {
  pdfDocProxy: PDFDocumentProxy;
  pageIndex: number;
  displayIndex: number;
  displayRotation: Rotation;
  selected: boolean;
  onToggle: (displayIndex: number, shiftKey: boolean) => void;
}

function Thumbnail({
  pdfDocProxy,
  pageIndex,
  displayIndex,
  displayRotation,
  selected,
  onToggle,
}: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const draw = async () => {
      try {
        const page = await pdfDocProxy.getPage(pageIndex + 1);
        if (cancelled) return;

        const baseRotation = page.rotate || 0;
        const effectiveRotation = (baseRotation + displayRotation) % 360;
        const natural = page.getViewport({ scale: 1, rotation: effectiveRotation });
        const scale = THUMB_TARGET_WIDTH / natural.width;
        const viewport = page.getViewport({ scale, rotation: effectiveRotation });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport }) as unknown as {
          cancel: () => void;
          promise: Promise<void>;
        };
        renderTask = task;
        await task.promise;
      } catch (err: unknown) {
        const name = (err as { name?: string })?.name;
        if (name === "RenderingCancelledException") return;
        console.warn(`Failed to render thumbnail ${pageIndex + 1}:`, err);
      }
    };

    void draw();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pdfDocProxy, pageIndex, displayRotation]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={"thumb" + (selected ? " thumb--selected" : "")}
      onClick={(e) => onToggle(displayIndex, e.shiftKey)}
      title={`Page ${displayIndex + 1}${selected ? " (selected)" : ""}`}
    >
      <div className="thumb__canvas-wrap">
        <canvas ref={canvasRef} className="thumb__canvas" />
      </div>
      <div className="thumb__badge">{displayIndex + 1}</div>
    </button>
  );
}
