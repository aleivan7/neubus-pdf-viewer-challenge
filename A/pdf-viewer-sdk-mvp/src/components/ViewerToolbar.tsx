import type { ChangeEvent } from "react";
import type { FitMode, PageMode, ViewMode } from "../types";

interface ViewerToolbarProps {
  viewMode: ViewMode;
  pageMode: PageMode;
  fitMode: FitMode;
  zoom: number;
  currentPage: number;
  pageCount: number;
  disabled: boolean;

  onUploadClick: () => void;
  onToggleViewMode: () => void;
  onPageModeChange: (mode: PageMode) => void;
  onFitModeChange: (mode: FitMode) => void;
  onZoomChange: (zoom: number) => void;
  onGoToPage: (page: number) => void;
  onPrint: () => void;
  onDownload: () => void;
}

const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

export function ViewerToolbar(props: ViewerToolbarProps) {
  const {
    viewMode,
    pageMode,
    fitMode,
    zoom,
    currentPage,
    pageCount,
    disabled,
    onUploadClick,
    onToggleViewMode,
    onPageModeChange,
    onFitModeChange,
    onZoomChange,
    onGoToPage,
    onPrint,
    onDownload,
  } = props;

  const handleZoomIn = () => {
    onFitModeChange("none");
    onZoomChange(Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2)));
  };
  const handleZoomOut = () => {
    onFitModeChange("none");
    onZoomChange(Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2)));
  };

  const handlePageInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(1, Math.min(pageCount || 1, Math.floor(n)));
    onGoToPage(clamped);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Viewer toolbar">
      <button type="button" className="btn" onClick={onUploadClick}>
        Open PDF
      </button>

      <div className="toolbar__divider" />

      <div className="toolbar__group" aria-label="Page navigation">
        <button
          type="button"
          className="btn btn--icon"
          onClick={() => onGoToPage(Math.max(1, currentPage - 1))}
          disabled={disabled || currentPage <= 1}
          title="Previous page"
          aria-label="Previous page"
        >
          {"\u2039"}
        </button>
        <input
          className="input input--page"
          type="number"
          min={1}
          max={Math.max(1, pageCount)}
          value={pageCount === 0 ? 0 : currentPage}
          onChange={handlePageInput}
          disabled={disabled}
          aria-label="Current page"
        />
        <span className="toolbar__label">/ {pageCount}</span>
        <button
          type="button"
          className="btn btn--icon"
          onClick={() => onGoToPage(Math.min(pageCount, currentPage + 1))}
          disabled={disabled || currentPage >= pageCount}
          title="Next page"
          aria-label="Next page"
        >
          {"\u203A"}
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group" aria-label="Zoom">
        <button
          type="button"
          className="btn btn--icon"
          onClick={handleZoomOut}
          disabled={disabled}
          title="Zoom out"
          aria-label="Zoom out"
        >
          -
        </button>
        <span className="toolbar__label" style={{ minWidth: 42, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="btn btn--icon"
          onClick={handleZoomIn}
          disabled={disabled}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className={"btn" + (fitMode === "width" ? " btn--active" : "")}
          onClick={() => onFitModeChange(fitMode === "width" ? "none" : "width")}
          disabled={disabled}
          title="Fit to width"
        >
          Fit Width
        </button>
        <button
          type="button"
          className={"btn" + (fitMode === "page" ? " btn--active" : "")}
          onClick={() => onFitModeChange(fitMode === "page" ? "none" : "page")}
          disabled={disabled}
          title="Fit whole page in viewport"
        >
          Fit Page
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group" aria-label="Layout">
        <button
          type="button"
          className={"btn" + (pageMode === "single" ? " btn--active" : "")}
          onClick={() => onPageModeChange("single")}
          disabled={disabled}
          title="Single page mode"
        >
          Single
        </button>
        <button
          type="button"
          className={"btn" + (pageMode === "continuous" ? " btn--active" : "")}
          onClick={() => onPageModeChange("continuous")}
          disabled={disabled}
          title="Continuous scroll mode"
        >
          Continuous
        </button>
      </div>

      <div className="toolbar__divider" />

      <button
        type="button"
        className={"btn" + (viewMode === "edit" ? " btn--active" : "")}
        onClick={onToggleViewMode}
        disabled={disabled}
        title="Toggle document editor"
      >
        {viewMode === "edit" ? "Exit Editor" : "Edit Document"}
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        onClick={onPrint}
        disabled={disabled}
        title="Print"
      >
        Print
      </button>
      <button
        type="button"
        className="btn"
        onClick={onDownload}
        disabled={disabled}
        title="Download current PDF"
      >
        Download
      </button>
    </div>
  );
}
