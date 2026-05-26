/**
 * PageThumbnailGrid
 *
 * Renders a low-resolution thumbnail per page in editor mode. Pages can be
 * clicked to toggle selection, or shift-clicked to extend the last range.
 * Drag-and-drop reorders pages in the grid; Move Up / Move Down remain as
 * the keyboard-accessible fallback.
 *
 * Thumbnails are cached by `pageIndex` keys and re-render only when the
 * underlying proxy or display rotation changes. Render tasks are cancelled
 * on unmount/update to keep PDF.js workers free.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "../utils/pdfjs";
import type { Rotation } from "../types";

interface PageThumbnailGridProps {
  pdfDocProxy: PDFDocumentProxy;
  /** Source page indices in the order they should be displayed. */
  displayOrder: number[];
  pageRotations: Record<number, Rotation>;
  selectedPages: ReadonlySet<number>;
  onToggleSelect: (displayIndex: number, shiftKey: boolean) => void;
  onReorderPages: (newDisplayOrder: number[]) => void;
}

interface DropTarget {
  idx: number;
  before: boolean;
}

const THUMB_TARGET_WIDTH = 160;

/** Move the item at `from` to before/after display index `to`. */
function reorderDisplayOrder(
  order: number[],
  from: number,
  to: number,
  before: boolean
): number[] {
  if (from === to && before) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  let insertAt = before ? to : to + 1;
  if (from < to) insertAt -= 1;
  if (insertAt === from) return order;
  next.splice(insertAt, 0, item);
  return next;
}

export function PageThumbnailGrid({
  pdfDocProxy,
  displayOrder,
  pageRotations,
  selectedPages,
  onToggleSelect,
  onReorderPages,
}: PageThumbnailGridProps) {
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const clearDragState = useCallback(() => {
    setDragSourceIdx(null);
    setDropTarget(null);
  }, []);

  const handleDragStart = useCallback((displayIndex: number, e: React.DragEvent) => {
    setDragSourceIdx(displayIndex);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(displayIndex));
  }, []);

  const handleDragOver = useCallback(
    (displayIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragSourceIdx === null) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      setDropTarget((prev) => {
        if (prev?.idx === displayIndex && prev.before === before) return prev;
        return { idx: displayIndex, before };
      });
    },
    [dragSourceIdx]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (displayIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragSourceIdx === null) {
        clearDragState();
        return;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      const newOrder = reorderDisplayOrder(displayOrder, dragSourceIdx, displayIndex, before);

      if (newOrder !== displayOrder) {
        onReorderPages(newOrder);
      }
      clearDragState();
    },
    [clearDragState, displayOrder, dragSourceIdx, onReorderPages]
  );

  const handleDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

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
          isDragging={dragSourceIdx === displayIndex}
          dropBefore={dropTarget?.idx === displayIndex && dropTarget.before}
          dropAfter={dropTarget?.idx === displayIndex && !dropTarget.before}
          onToggle={onToggleSelect}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
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
  isDragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onToggle: (displayIndex: number, shiftKey: boolean) => void;
  onDragStart: (displayIndex: number, e: React.DragEvent) => void;
  onDragOver: (displayIndex: number, e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (displayIndex: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function Thumbnail({
  pdfDocProxy,
  pageIndex,
  displayIndex,
  displayRotation,
  selected,
  isDragging,
  dropBefore,
  dropAfter,
  onToggle,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
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

  const className = [
    "thumb",
    selected ? "thumb--selected" : "",
    isDragging ? "thumb--dragging" : "",
    dropBefore ? "thumb--drop-before" : "",
    dropAfter ? "thumb--drop-after" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role="option"
      draggable
      aria-selected={selected}
      aria-grabbed={isDragging}
      aria-roledescription="draggable page thumbnail"
      className={className}
      onClick={(e) => onToggle(displayIndex, e.shiftKey)}
      title={`Page ${displayIndex + 1}${selected ? " (selected)" : ""}. Drag to reorder.`}
      onDragStart={(e) => onDragStart(displayIndex, e)}
      onDragOver={(e) => onDragOver(displayIndex, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(displayIndex, e)}
      onDragEnd={onDragEnd}
    >
      <div className="thumb__canvas-wrap">
        <canvas ref={canvasRef} className="thumb__canvas" />
      </div>
      <div className="thumb__badge">{displayIndex + 1}</div>
    </button>
  );
}
