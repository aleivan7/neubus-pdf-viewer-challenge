/**
 * PdfViewer
 *
 * Renders pages from a PDF.js PDFDocumentProxy onto canvas elements.
 *
 * Rendering strategy:
 *   - Continuous mode renders all pages in a vertically scrollable list.
 *   - Single mode renders only the current page.
 *
 * Zoom / fit modes:
 *   - When `fitMode === "width"` or `"page"` we compute a derived scale
 *     from the container size and the page's natural viewport. Otherwise
 *     we use the `zoom` value directly.
 *   - Recomputing on container resize keeps fit modes responsive.
 *
 * Each page is rendered on its own <canvas>. Render tasks are tracked so
 * we can cancel an in-flight render when a new one is requested (e.g.
 * during rapid zoom changes), preventing pdfjs "canvas already in use"
 * errors.
 */

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { PDFDocumentProxy } from "../utils/pdfjs";
import type { FitMode, PageMode, Rotation } from "../types";

interface PdfViewerProps {
  pdfDocProxy: PDFDocumentProxy | null;
  pageMode: PageMode;
  fitMode: FitMode;
  zoom: number;
  currentPage: number;
  /** Display-only rotations keyed by 0-based page index. */
  pageRotations: Record<number, Rotation>;
  onCurrentPageChange: (page: number) => void;
  /** True only after explicit toolbar page navigation (Next/Prev/page input). */
  shouldScrollToPageRef: MutableRefObject<boolean>;
}

const DEVICE_PIXEL_RATIO =
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

export function PdfViewer({
  pdfDocProxy,
  pageMode,
  fitMode,
  zoom,
  currentPage,
  pageRotations,
  onCurrentPageChange,
  shouldScrollToPageRef,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (pageMode !== "continuous") return;
    if (!shouldScrollToPageRef.current) return;

    shouldScrollToPageRef.current = false;

    const el = pageRefs.current[currentPage - 1];
    if (el && containerRef.current) {
      const cRect = containerRef.current.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const visible = eRect.top >= cRect.top && eRect.top <= cRect.bottom - 20;
      if (!visible) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentPage, pageMode, shouldScrollToPageRef]);

  useEffect(() => {
    if (pageMode !== "continuous" || !pdfDocProxy) return;
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(idx)) continue;
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx = idx;
          }
        }
        if (bestIdx >= 0) onCurrentPageChange(bestIdx + 1);
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );

    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pdfDocProxy, pageMode, onCurrentPageChange]);

  if (!pdfDocProxy) return null;

  const pageCount = pdfDocProxy.numPages;
  const indicesToRender =
    pageMode === "single"
      ? [Math.min(pageCount, Math.max(1, currentPage)) - 1]
      : Array.from({ length: pageCount }, (_, i) => i);

  pageRefs.current = pageRefs.current.slice(0, pageCount);

  return (
    <div className="viewer" ref={containerRef}>
      <div className="viewer__pages">
        {indicesToRender.map((idx) => (
          <PdfPage
            key={`${idx}-${pageRotations[idx] ?? 0}`}
            ref={(el) => {
              pageRefs.current[idx] = el;
            }}
            pdfDocProxy={pdfDocProxy}
            pageIndex={idx}
            displayRotation={pageRotations[idx] ?? 0}
            zoom={zoom}
            fitMode={fitMode}
            containerSize={containerSize}
          />
        ))}
      </div>
    </div>
  );
}

interface PdfPageProps {
  pdfDocProxy: PDFDocumentProxy;
  pageIndex: number;
  displayRotation: Rotation;
  zoom: number;
  fitMode: FitMode;
  containerSize: { width: number; height: number };
}

const PdfPage = forwardRef<HTMLDivElement, PdfPageProps>(function PdfPageImpl(
  { pdfDocProxy, pageIndex, displayRotation, zoom, fitMode, containerSize },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const render = async () => {
      try {
        const page = await pdfDocProxy.getPage(pageIndex + 1);
        if (cancelled) return;

        // Combine the file's intrinsic rotation with the user's display
        // rotation so manual rotations stack on top of PDF-level orientation.
        const baseRotation = page.rotate || 0;
        const effectiveRotation = (baseRotation + displayRotation) % 360;

        const naturalViewport = page.getViewport({
          scale: 1,
          rotation: effectiveRotation,
        });

        let scale = zoom;
        if (fitMode === "width" && containerSize.width > 0) {
          scale = Math.max(0.1, (containerSize.width - 32) / naturalViewport.width);
        } else if (
          fitMode === "page" &&
          containerSize.width > 0 &&
          containerSize.height > 0
        ) {
          const widthScale = (containerSize.width - 32) / naturalViewport.width;
          const heightScale = (containerSize.height - 32) / naturalViewport.height;
          scale = Math.max(0.1, Math.min(widthScale, heightScale));
        }

        const viewport = page.getViewport({ scale, rotation: effectiveRotation });
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Backing store at devicePixelRatio for crisp HiDPI text.
        canvas.width = Math.floor(viewport.width * DEVICE_PIXEL_RATIO);
        canvas.height = Math.floor(viewport.height * DEVICE_PIXEL_RATIO);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);

        const task = page.render({ canvasContext: ctx, viewport }) as unknown as {
          cancel: () => void;
          promise: Promise<void>;
        };
        renderTask = task;
        await task.promise;
      } catch (err: unknown) {
        const name = (err as { name?: string })?.name;
        if (name === "RenderingCancelledException") return;
        console.warn(`Failed to render page ${pageIndex + 1}:`, err);
      }
    };

    void render();

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
  }, [
    pdfDocProxy,
    pageIndex,
    displayRotation,
    zoom,
    fitMode,
    containerSize.width,
    containerSize.height,
  ]);

  return (
    <div
      className="viewer__page"
      ref={ref}
      data-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1}`}
    >
      <div className="viewer__page-number">{pageIndex + 1}</div>
      <canvas ref={canvasRef} className="viewer__canvas" />
    </div>
  );
});
