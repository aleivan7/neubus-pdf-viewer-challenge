/**
 * App
 *
 * Top-level container that owns all PDF state and wires the toolbars,
 * viewer, and editor grid. State is intentionally kept in a single place
 * (rather than split into context / Zustand / Redux) because:
 *   - the surface area is small
 *   - every screen needs almost the same slice of state
 *   - the canonical artifact is `currentPdfBytes`; everything else is derived
 *
 * Editing flow:
 *   1. User triggers an action (rotate, delete, extract, merge, save).
 *   2. We flush any session-level rotations/order into the bytes via pdf-lib.
 *   3. The new bytes replace `currentPdfBytes`.
 *   4. usePdfDocument rebuilds the PDF.js proxy and the viewer/grid refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/AppShell";
import { ViewerToolbar } from "./components/ViewerToolbar";
import { EditorToolbar } from "./components/EditorToolbar";
import { PdfViewer } from "./components/PdfViewer";
import { PageThumbnailGrid } from "./components/PageThumbnailGrid";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { usePdfDocument } from "./hooks/usePdfDocument";
import {
  downloadBytes,
  printPdfBytes,
  readFileAsBytes,
  suffixFilename,
} from "./utils/fileUtils";
import {
  deletePages,
  extractPages,
  mergePdfs,
  reorderPages,
  setPageRotations,
} from "./utils/pdfOperations";
import type { FitMode, PageMode, Rotation, ViewMode } from "./types";

export default function App() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [currentPdfBytes, setCurrentPdfBytes] = useState<Uint8Array | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("view");
  const [pageMode, setPageMode] = useState<PageMode>("continuous");
  const [fitMode, setFitMode] = useState<FitMode>("width");
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection is indexed against the *currently displayed* page order.
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // Session-only overrides on top of the bytes. Reordering is represented as
  // an explicit array because pdf-lib has no "rotate ack" - we flush both
  // into the bytes before save/extract/download.
  const [pageRotations, setPageRotationsState] = useState<Record<number, Rotation>>({});
  const [pageOrder, setPageOrderState] = useState<number[] | null>(null);

  // Busy flag for long-running pdf-lib operations.
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Used as the click target for hidden file inputs.
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  // Tracks the last clicked thumbnail for shift-click range selection.
  const lastSelectedRef = useRef<number | null>(null);
  // Set by explicit toolbar navigation; PdfViewer scrolls only when true.
  const shouldScrollToPageRef = useRef(false);

  const { pdfDocProxy, pageCount, loading: parseLoading, error: parseError } =
    usePdfDocument(currentPdfBytes);

  // Surface parser errors via the same channel as our own operation errors.
  useEffect(() => {
    if (parseError) setError(parseError);
  }, [parseError]);

  const loading = busy || parseLoading;

  // Whenever the document changes (new file, edit applied), reset
  // per-document derived state so we don't end up with stale selection or
  // out-of-bounds rotations.
  useEffect(() => {
    setSelectedPages(new Set());
    setPageRotationsState({});
    setPageOrderState(null);
    lastSelectedRef.current = null;
    setCurrentPage((p) => Math.min(Math.max(1, p), pageCount || 1));
  }, [pageCount, currentPdfBytes]);

  /* ------------------------------------------------------------------ */
  /* File loading                                                        */
  /* ------------------------------------------------------------------ */

  const loadFile = useCallback(async (file: File) => {
    try {
      setBusy(true);
      setProgress(0);
      setError(null);
      const bytes = await readFileAsBytes(file);
      setProgress(1);
      setOriginalFile(file);
      setCurrentPdfBytes(bytes);
      setCurrentPage(1);
      setViewMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const handleOpenClick = () => openInputRef.current?.click();
  const handleOpenChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadFile(file);
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
  };

  const handleBack = () => {
    setOriginalFile(null);
    setCurrentPdfBytes(null);
    setViewMode("view");
    setError(null);
  };

  /* ------------------------------------------------------------------ */
  /* Helpers: flush session overrides into bytes                         */
  /* ------------------------------------------------------------------ */

  /**
   * Apply session-level page reorder and rotations to the current bytes,
   * returning fresh bytes. Used before any save/extract/download/edit so
   * downstream operations see a consistent document.
   */
  const flushOverrides = useCallback(async (): Promise<Uint8Array> => {
    if (!currentPdfBytes) throw new Error("No document loaded.");
    let bytes = currentPdfBytes;
    if (pageOrder && !isIdentityOrder(pageOrder)) {
      bytes = await reorderPages(bytes, pageOrder);
    }
    if (Object.keys(pageRotations).length > 0) {
      // If we reordered, remap rotation keys to the new positions.
      const rotationsForNewIndex: Record<number, Rotation> = {};
      if (pageOrder) {
        pageOrder.forEach((srcIdx, newIdx) => {
          const r = pageRotations[srcIdx];
          if (r !== undefined && r !== 0) rotationsForNewIndex[newIdx] = r;
        });
      } else {
        Object.assign(rotationsForNewIndex, pageRotations);
      }
      if (Object.keys(rotationsForNewIndex).length > 0) {
        bytes = await setPageRotations(bytes, rotationsForNewIndex);
      }
    }
    return bytes;
  }, [currentPdfBytes, pageOrder, pageRotations]);

  /* ------------------------------------------------------------------ */
  /* Viewer toolbar handlers                                             */
  /* ------------------------------------------------------------------ */

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(pageCount || 1, page));
      shouldScrollToPageRef.current = true;
      setCurrentPage(clamped);
    },
    [pageCount]
  );

  const handleDownload = useCallback(async () => {
    try {
      setBusy(true);
      const bytes = await flushOverrides();
      const name = suffixFilename(originalFile?.name ?? "document.pdf", "");
      downloadBytes(bytes, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [flushOverrides, originalFile]);

  const handlePrint = useCallback(async () => {
    try {
      setBusy(true);
      const bytes = await flushOverrides();
      printPdfBytes(bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [flushOverrides]);

  /* ------------------------------------------------------------------ */
  /* Editor selection helpers                                            */
  /* ------------------------------------------------------------------ */

  const displayOrder = useMemo<number[]>(() => {
    if (pageOrder) return pageOrder;
    return Array.from({ length: pageCount }, (_, i) => i);
  }, [pageOrder, pageCount]);

  const toggleSelect = useCallback(
    (pageIndex: number, shiftKey: boolean) => {
      setSelectedPages((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedRef.current !== null) {
          const start = Math.min(lastSelectedRef.current, pageIndex);
          const end = Math.max(lastSelectedRef.current, pageIndex);
          for (let i = start; i <= end; i++) next.add(i);
        } else {
          if (next.has(pageIndex)) next.delete(pageIndex);
          else next.add(pageIndex);
        }
        return next;
      });
      lastSelectedRef.current = pageIndex;
    },
    []
  );

  const handleSelectAll = () => {
    setSelectedPages(new Set(displayOrder.map((_, i) => i)));
  };

  const handleClearSelection = () => {
    setSelectedPages(new Set());
    lastSelectedRef.current = null;
  };

  /* ------------------------------------------------------------------ */
  /* Editor toolbar handlers                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Apply a relative rotation to the selected pages in-session. We map the
   * display-order index back to the underlying source index so the rotation
   * follows the page even after reordering.
   */
  const applyRelativeRotation = (delta: 90 | -90 | 180) => {
    if (selectedPages.size === 0) return;
    setPageRotationsState((prev) => {
      const next = { ...prev };
      for (const displayIdx of selectedPages) {
        const srcIdx = displayOrder[displayIdx];
        if (srcIdx === undefined) continue;
        const current = next[srcIdx] ?? 0;
        const updated = (((current + delta) % 360) + 360) % 360;
        next[srcIdx] = updated as Rotation;
      }
      return next;
    });
  };

  const handleRotateLeft = () => applyRelativeRotation(-90);
  const handleRotateRight = () => applyRelativeRotation(90);

  const handleMoveUp = () => moveSelection(-1);
  const handleMoveDown = () => moveSelection(1);

  /**
   * Apply a new display order from drag-and-drop. Selection is remapped by
   * source page index so it survives the reorder; the dragged page stays
   * selected even if it was not part of the prior selection.
   */
  const handleReorderPages = useCallback(
    (newOrder: number[]) => {
      const selectedSources = new Set<number>();
      for (const displayIdx of selectedPages) {
        const src = displayOrder[displayIdx];
        if (src !== undefined) selectedSources.add(src);
      }

      const movedSource = findMovedSourcePage(displayOrder, newOrder);
      if (movedSource !== null) selectedSources.add(movedSource);

      const newSelected = new Set<number>();
      newOrder.forEach((src, displayIdx) => {
        if (selectedSources.has(src)) newSelected.add(displayIdx);
      });

      setPageOrderState(newOrder);
      setSelectedPages(newSelected);
    },
    [displayOrder, selectedPages]
  );

  /**
   * Move the selected pages by `delta` positions (sign indicates direction).
   * We move them in the right order so we don't collide with ourselves.
   */
  const moveSelection = (delta: -1 | 1) => {
    if (selectedPages.size === 0 || pageCount === 0) return;
    const order = displayOrder.slice();
    const selected = [...selectedPages].sort((a, b) => a - b);
    const ordered = delta < 0 ? selected : selected.slice().reverse();

    const newSelected = new Set<number>();
    for (const idx of ordered) {
      const target = idx + delta;
      if (target < 0 || target >= order.length) {
        newSelected.add(idx);
        continue;
      }
      // Don't move into another selected slot (would just swap repeatedly).
      if (selectedPages.has(target) && !newSelected.has(target)) {
        newSelected.add(idx);
        continue;
      }
      const [item] = order.splice(idx, 1);
      order.splice(target, 0, item);
      newSelected.add(target);
    }

    setPageOrderState(order);
    setSelectedPages(newSelected);
  };

  const handleDelete = async () => {
    if (selectedPages.size === 0) return;
    try {
      setBusy(true);
      // Map display indices to source indices, then flush.
      const sourceIndicesToKeep = displayOrder.filter(
        (_, displayIdx) => !selectedPages.has(displayIdx)
      );
      // We need to first flush rotations/order so the surviving pages
      // carry their session edits into the new document.
      const flushed = await flushOverrides();
      // After flushing, indices in `flushed` correspond to displayOrder positions.
      const displayIdxToDelete = [...selectedPages];
      const result = await deletePages(flushed, displayIdxToDelete);
      void sourceIndicesToKeep; // silence unused, kept for documentation
      setCurrentPdfBytes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExtract = async () => {
    if (selectedPages.size === 0) return;
    try {
      setBusy(true);
      const flushed = await flushOverrides();
      // Preserve the user's selection order by sorting selected display indices.
      const displayIdxToExtract = [...selectedPages].sort((a, b) => a - b);
      const newBytes = await extractPages(flushed, displayIdxToExtract);
      const name = suffixFilename(originalFile?.name ?? "document.pdf", "-extract");
      downloadBytes(newBytes, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImportMergeClick = () => mergeInputRef.current?.click();
  const handleImportMergeChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const newBytes = await readFileAsBytes(file);
      const flushed = await flushOverrides();
      const merged = await mergePdfs(flushed, newBytes);
      setCurrentPdfBytes(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    try {
      setBusy(true);
      const flushed = await flushOverrides();
      const name = suffixFilename(originalFile?.name ?? "document.pdf", "-edited");
      downloadBytes(flushed, name);
      // Also commit the flushed bytes back to state so subsequent edits
      // start from a clean baseline.
      setCurrentPdfBytes(flushed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const hasDocument = !!pdfDocProxy && pageCount > 0;
  const title = originalFile?.name ?? "PDF Viewer SDK";
  const subtitle = hasDocument ? `${pageCount} pages` : "No document loaded";

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      onBack={hasDocument ? handleBack : undefined}
      onQuickDownload={handleDownload}
      canQuickDownload={hasDocument && !loading}
      toolbar={
        <>
          <ViewerToolbar
            viewMode={viewMode}
            pageMode={pageMode}
            fitMode={fitMode}
            zoom={zoom}
            currentPage={currentPage}
            pageCount={pageCount}
            disabled={!hasDocument || loading}
            onUploadClick={handleOpenClick}
            onToggleViewMode={() =>
              setViewMode((m) => (m === "view" ? "edit" : "view"))
            }
            onPageModeChange={setPageMode}
            onFitModeChange={setFitMode}
            onZoomChange={setZoom}
            onGoToPage={goToPage}
            onPrint={handlePrint}
            onDownload={handleDownload}
          />
          {viewMode === "edit" && hasDocument && (
            <EditorToolbar
              selectedCount={selectedPages.size}
              pageCount={pageCount}
              disabled={loading}
              onRotateLeft={handleRotateLeft}
              onRotateRight={handleRotateRight}
              onDelete={handleDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onExtract={handleExtract}
              onImportMerge={handleImportMergeClick}
              onSave={handleSave}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
            />
          )}
        </>
      }
    >
      <input
        ref={openInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={handleOpenChange}
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={handleImportMergeChange}
      />

      {error && (
        <div className="banner banner--error" role="alert">
          <strong>Error:</strong> {error}
          <button
            className="banner__dismiss"
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {loading && (
        <div className="overlay">
          <LoadingIndicator
            progress={progress}
            message={busy ? "Working on your PDF..." : "Parsing PDF..."}
          />
        </div>
      )}

      {!hasDocument && !loading && (
        <EmptyState onOpen={handleOpenClick} />
      )}

      {hasDocument && viewMode === "view" && (
        <PdfViewer
          pdfDocProxy={pdfDocProxy}
          pageMode={pageMode}
          fitMode={fitMode}
          zoom={zoom}
          currentPage={currentPage}
          pageRotations={remapRotationsForDisplay(pageRotations, displayOrder)}
          onCurrentPageChange={setCurrentPage}
          shouldScrollToPageRef={shouldScrollToPageRef}
        />
      )}

      {hasDocument && viewMode === "edit" && pdfDocProxy && (
        <PageThumbnailGrid
          pdfDocProxy={pdfDocProxy}
          displayOrder={displayOrder}
          pageRotations={pageRotations}
          selectedPages={selectedPages}
          onToggleSelect={toggleSelect}
          onReorderPages={handleReorderPages}
        />
      )}
    </AppShell>
  );
}

interface EmptyStateProps {
  onOpen: () => void;
}

function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__card">
        <h1 className="empty__title">PDF Viewer SDK</h1>
        <p className="empty__lede">
          Open a PDF from your computer to start. Everything stays on your
          device - no upload, no backend.
        </p>
        <ul className="empty__bullets">
          <li>View pages with zoom, fit-to-width, fit-to-page, and continuous scroll.</li>
          <li>Switch to the Document Editor to rotate, delete, reorder, extract, or merge pages.</li>
          <li>Download or print your changes at any time.</li>
        </ul>
        <button type="button" className="btn btn--primary btn--lg" onClick={onOpen}>
          Open a PDF
        </button>
        <p className="empty__hint">
          Tip: tap <kbd>Shift</kbd> + click in the editor to select a range of pages.
        </p>
      </div>
    </div>
  );
}

function isIdentityOrder(order: number[]): boolean {
  for (let i = 0; i < order.length; i++) {
    if (order[i] !== i) return false;
  }
  return true;
}

/** Source page that changed display position (single-item drag reorder). */
function findMovedSourcePage(oldOrder: number[], newOrder: number[]): number | null {
  let moved: number | null = null;
  for (let i = 0; i < oldOrder.length; i++) {
    const src = oldOrder[i];
    const newIdx = newOrder.indexOf(src);
    if (newIdx !== i) {
      if (moved !== null) return moved;
      moved = src;
    }
  }
  return moved;
}

/**
 * The viewer renders pages in *display order* (after reorder). But our
 * `pageRotations` map is keyed by *source index* so rotations stick to a
 * specific page through reorders. This helper rebuilds the rotation map
 * keyed by display index for the viewer.
 */
function remapRotationsForDisplay(
  rotations: Record<number, Rotation>,
  displayOrder: number[]
): Record<number, Rotation> {
  const out: Record<number, Rotation> = {};
  displayOrder.forEach((srcIdx, displayIdx) => {
    const r = rotations[srcIdx];
    if (r !== undefined && r !== 0) out[displayIdx] = r;
  });
  return out;
}
