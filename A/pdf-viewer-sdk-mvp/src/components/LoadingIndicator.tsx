interface LoadingIndicatorProps {
  /** Optional 0..1 progress; if undefined an indeterminate bar is shown. */
  progress?: number | null;
  message?: string;
}

export function LoadingIndicator({ progress, message }: LoadingIndicatorProps) {
  const pct =
    typeof progress === "number" ? Math.max(0, Math.min(1, progress)) : null;

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__message">{message ?? "Loading..."}</div>
      <div className="loading__bar">
        <div
          className={
            "loading__bar-fill" + (pct === null ? " loading__bar-fill--indet" : "")
          }
          style={pct !== null ? { width: `${Math.round(pct * 100)}%` } : undefined}
        />
      </div>
    </div>
  );
}
