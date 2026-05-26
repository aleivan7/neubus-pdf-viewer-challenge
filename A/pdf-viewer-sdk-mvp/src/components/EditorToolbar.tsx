interface EditorToolbarProps {
  selectedCount: number;
  pageCount: number;
  disabled: boolean;

  onRotateLeft: () => void;
  onRotateRight: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onExtract: () => void;
  onImportMerge: () => void;
  onSave: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const {
    selectedCount,
    pageCount,
    disabled,
    onRotateLeft,
    onRotateRight,
    onDelete,
    onMoveUp,
    onMoveDown,
    onExtract,
    onImportMerge,
    onSave,
    onSelectAll,
    onClearSelection,
  } = props;

  const hasSelection = selectedCount > 0;

  return (
    <div className="toolbar toolbar--editor" role="toolbar" aria-label="Editor toolbar">
      <span className="toolbar__label">
        {selectedCount} of {pageCount} selected
      </span>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        onClick={onSelectAll}
        disabled={disabled || pageCount === 0}
      >
        Select All
      </button>
      <button
        type="button"
        className="btn"
        onClick={onClearSelection}
        disabled={disabled || !hasSelection}
      >
        Clear
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        onClick={onRotateLeft}
        disabled={disabled || !hasSelection}
        title="Rotate selected pages 90 counter-clockwise"
      >
        Rotate Left
      </button>
      <button
        type="button"
        className="btn"
        onClick={onRotateRight}
        disabled={disabled || !hasSelection}
        title="Rotate selected pages 90 clockwise"
      >
        Rotate Right
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        onClick={onMoveUp}
        disabled={disabled || !hasSelection}
        title="Move selected page(s) up"
      >
        Move Up
      </button>
      <button
        type="button"
        className="btn"
        onClick={onMoveDown}
        disabled={disabled || !hasSelection}
        title="Move selected page(s) down"
      >
        Move Down
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn btn--danger"
        onClick={onDelete}
        disabled={disabled || !hasSelection || selectedCount >= pageCount}
        title="Delete selected pages"
      >
        Delete
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        onClick={onExtract}
        disabled={disabled || !hasSelection}
        title="Extract selected pages into a new PDF"
      >
        Extract
      </button>
      <button
        type="button"
        className="btn"
        onClick={onImportMerge}
        disabled={disabled}
        title="Append another PDF to this document"
      >
        Import / Merge
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn btn--primary"
        onClick={onSave}
        disabled={disabled || pageCount === 0}
        title="Save edited PDF"
      >
        Save
      </button>
    </div>
  );
}
