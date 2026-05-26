/**
 * Browser file I/O helpers. Everything stays client-side - no network calls.
 */

/** Read a File into a Uint8Array using the Blob.arrayBuffer() API. */
export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Trigger a browser download for the given bytes.
 *
 * We copy the bytes into a fresh ArrayBuffer to avoid passing a possibly
 * detached buffer (pdf-lib's `save()` can sometimes return views over
 * shared/transferred memory in edge cases). The copy is cheap relative to
 * PDF size and avoids hard-to-debug Blob construction errors.
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/pdf"
): void {
  const safeCopy = new Uint8Array(bytes);
  const blob = new Blob([safeCopy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open a hidden iframe pointing at the PDF object URL and call print().
 * This is the simplest cross-browser way to print without a backend.
 */
export function printPdfBytes(bytes: Uint8Array): void {
  const safeCopy = new Uint8Array(bytes);
  const blob = new Blob([safeCopy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      // Fallback - open in a new tab so the user can print manually.
      console.warn("Inline print failed, opening in new tab", err);
      window.open(url, "_blank");
    }
  };

  // Clean up the iframe a few minutes later; print dialog is modal so the
  // user typically dismisses it long before then.
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    URL.revokeObjectURL(url);
  }, 5 * 60 * 1000);
}

/** Strip the `.pdf` extension and append a suffix, e.g. "report" + "-edited". */
export function suffixFilename(filename: string, suffix: string): string {
  const lower = filename.toLowerCase();
  const base = lower.endsWith(".pdf") ? filename.slice(0, -4) : filename;
  return `${base}${suffix}.pdf`;
}
