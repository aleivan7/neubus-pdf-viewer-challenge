/**
 * usePdfDocument
 *
 * Takes the authoritative `Uint8Array` for the current document and produces
 * a PDF.js `PDFDocumentProxy` for rendering. Re-runs whenever the bytes
 * reference changes (so any edit that returns new bytes triggers a refresh).
 */

import { useEffect, useState } from "react";
import { createPdfWorker, pdfjsLib, type PDFDocumentProxy } from "../utils/pdfjs";

export interface UsePdfDocumentResult {
  pdfDocProxy: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
}

export function usePdfDocument(bytes: Uint8Array | null): UsePdfDocumentResult {
  const [proxy, setProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bytes) {
      setProxy(null);
      setPageCount(0);
      setError(null);
      return;
    }

    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    let loadedProxy: PDFDocumentProxy | null = null;
    const worker = createPdfWorker();

    setLoading(true);
    setError(null);

    // pdfjs mutates the buffer it receives in some code paths; pass a copy.
    const copy = new Uint8Array(bytes);
    task = pdfjsLib.getDocument({ data: copy, worker });

    task.promise
      .then((doc) => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        loadedProxy = doc;
        setProxy(doc);
        setPageCount(doc.numPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to parse PDF: ${msg}`);
        setProxy(null);
        setPageCount(0);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      // Cancel the in-flight load if still running, and destroy any
      // proxy we successfully created so PDF.js releases its workers.
      try {
        task?.destroy();
      } catch {
        /* ignore */
      }
      if (loadedProxy) {
        loadedProxy.destroy().catch(() => {
          /* ignore */
        });
      }
      worker.destroy();
    };
  }, [bytes]);

  return { pdfDocProxy: proxy, pageCount, loading, error };
}
