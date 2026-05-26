import type { ReactNode } from "react";

interface AppShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onQuickDownload?: () => void;
  canQuickDownload: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  onBack,
  onQuickDownload,
  canQuickDownload,
  toolbar,
  children,
}: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__title-row">
          {onBack && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onBack}
              aria-label="Back"
              title="Close document"
            >
              {"\u2190"}
            </button>
          )}
          <div className="shell__title">
            <div className="shell__title-main">{title}</div>
            {subtitle && <div className="shell__title-sub">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onQuickDownload}
            disabled={!canQuickDownload}
            title="Quick download current PDF"
          >
            Quick Download
          </button>
        </div>
        {toolbar && <div className="shell__toolbar">{toolbar}</div>}
      </header>
      <main className="shell__main">{children}</main>
    </div>
  );
}
