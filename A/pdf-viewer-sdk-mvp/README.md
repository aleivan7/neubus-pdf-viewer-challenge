# PDF Viewer SDK - MVP

A small browser-only PDF viewer & document editor SDK built with **React**, **Vite**, **TypeScript**, **PDF.js** (rendering), and **pdf-lib** (editing).

Everything runs in the browser. No backend, no upload.

---

## Setup

```bash
cd A/pdf-viewer-sdk-mvp
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Scripts

| Script           | Purpose                                |
| ---------------- | -------------------------------------- |
| `npm run dev`    | Start Vite dev server                  |
| `npm run build`  | Type-check (`tsc -b`) and bundle       |
| `npm run preview`| Serve the production build locally     |
| `npm test`       | Run Vitest unit tests for pdfOperations|
| `npm run test:watch` | Watch-mode tests                    |

Requirements: **Node 18+** (Node 20 LTS recommended). A modern Chromium/Firefox/Safari with `BroadcastChannel` and `ResizeObserver`.

---

## Features

### Viewer
- Open a local PDF via the **Open PDF** button.
- Navigate pages: next, previous, jump-to-page input.
- Zoom in/out, **Fit Width**, **Fit Page**.
- **Continuous** scroll mode or **Single** page mode.
- Smooth continuous scrolling with current-page tracking that follows the user without fighting their scroll position.
- High-DPI canvas rendering (uses `devicePixelRatio`).
- Loading indicator while parsing.
- Clear error banner on parse failures.
- **Light / Dark theme toggle** in the header. The selected theme is persisted in `localStorage` and respects the OS-level `prefers-color-scheme` on first load. Theming applies only to the app chrome; PDF canvas rendering is unchanged.

### Document Editor
- Toggle into **Edit Document** mode to see a thumbnail grid.
- Click to select / unselect pages. **Shift+click** to extend a range.
- **Rotate Left / Rotate Right** the selected pages.
- **Delete** selected pages (refused when it would empty the doc).
- **Move Up / Move Down** selected pages, with an immediate thumbnail-grid preview that matches what will be saved or exported.
- **Extract** selected pages into a new PDF (downloads immediately).
- **Import / Merge** another PDF onto the end of the current document.
- **Save** the edited PDF (downloads `-edited.pdf`).

### Output
- **Quick Download** in the header for the current document.
- **Print** via the browser print dialog (hidden iframe).
- **Download / Save** for the working copy and edited copy.

---

## Manual validation checklist

Use any non-trivial PDF (5+ pages, mixed orientations is best).

| # | Action                                                                                  | Pass criteria |
|---|-----------------------------------------------------------------------------------------|---------------|
| 1 | Empty state shows on first load                                                         | Card with "Open a PDF" button is visible. |
| 2 | `Open PDF` opens the file picker; selecting a PDF loads it                              | First page renders within a few seconds, page count shown in subtitle. |
| 3 | `Next` / `Previous` page buttons                                                        | Page input updates; viewer scrolls/swaps pages. |
| 4 | Type a number into the page input                                                       | Viewer jumps to that page. |
| 5 | `+` / `-` zoom                                                                          | Page redraws at new zoom; percentage label updates. |
| 6 | `Fit Width` / `Fit Page`                                                                | Page rescales; resizing the window keeps it fitted. |
| 7 | `Single` vs `Continuous`                                                                | Single shows only the current page; Continuous shows all. |
| 8 | `Quick Download`                                                                        | Browser downloads the current PDF with the original filename. |
| 9 | `Print`                                                                                 | Print dialog opens for the current PDF. |
| 10 | Switch to `Edit Document`                                                              | Thumbnail grid appears; each thumbnail has a page badge. |
| 11 | Click thumbnails to select; Shift+click for range                                       | Selected thumbnails get the blue highlight. |
| 12 | `Rotate Right`                                                                          | Selected thumbnails rotate 90 clockwise immediately. |
| 13 | `Move Down` on a selected page                                                          | Page reorders in the grid. |
| 14 | `Delete` on a selected page                                                             | Page disappears; page count drops. |
| 15 | `Extract` on a selection                                                                | Browser downloads `<name>-extract.pdf` containing just those pages. |
| 16 | `Import / Merge` another PDF                                                            | Document length grows by that file's page count. |
| 17 | `Save`                                                                                  | Browser downloads `<name>-edited.pdf` with all session edits applied. |
| 18 | Open the downloaded `-edited.pdf` in another viewer                                     | Rotations, deletions, reorders, merges are persisted. |
| 19 | Trigger an error (e.g. open a corrupted file)                                           | Red error banner appears; the rest of the UI stays usable. |

---

## Known limitations

- **No true WebAssembly engine.** Rendering is PDF.js (pure JavaScript). Editing is pdf-lib (pure JavaScript). We deliberately do not claim WASM support. See `B/architecture.md` for why and what we would use instead with more time.
- **Whole-file load.** Browsers' File API gives us the bytes only after the user picks a file, so we cannot stream a linearized PDF. Very large files (hundreds of MB) may parse slowly. With a backend we would serve byte-range requests so PDF.js can fetch only the parts it needs.
- **No annotations / form-filling / signatures / redactions.** These need a richer engine (PDFium / commercial SDK). We expose only structural edits (rotate / delete / reorder / extract / merge).
- **Some PDF features can degrade on re-save.** pdf-lib re-serializes the document on save; it preserves most pages, fonts, and images, but complex forms, JavaScript actions, or unusual encryption may not survive a round-trip. We `ignoreEncryption: true` so owner-locked PDFs at least render.
- **Up/Down reorder, not drag-and-drop.** The MVP uses Move Up/Move Down buttons. Drag-and-drop is a +1-day item.
- **Print path uses the OS dialog.** No per-page selection in the print dialog beyond what the browser already gives you.
- **No persistence.** Closing the tab loses the document.

---

## Where things live

```
src/
  main.tsx                       app entry
  App.tsx                        owns all state, wires toolbars + viewer + grid
  styles.css                     UI styles (no framework)
  types.ts                       small shared types
  components/
    AppShell.tsx                 header, title row, toolbar slot
    ViewerToolbar.tsx            nav, zoom, fit, mode, print, download, edit toggle
    EditorToolbar.tsx            rotate, delete, move, extract, merge, save
    PdfViewer.tsx                renders pages via PDF.js (continuous + single)
    PageThumbnailGrid.tsx        thumbnails with selection
    LoadingIndicator.tsx         determinate/indeterminate progress bar
  hooks/
    usePdfDocument.ts            bytes -> PDFDocumentProxy
  utils/
    pdfjs.ts                     centralized worker setup
    fileUtils.ts                 read / download / print bytes
    pdfOperations.ts             pdf-lib helpers (rotate / delete / reorder / extract / merge)
  __tests__/
    pdfOperations.test.ts        Vitest coverage for the helpers
```

See `../../B/architecture.md` for the architecture diagram, state model, tradeoffs, and the "+1 day" roadmap. See `../../C/ai-usage-log.md` for how AI assistance was used.
