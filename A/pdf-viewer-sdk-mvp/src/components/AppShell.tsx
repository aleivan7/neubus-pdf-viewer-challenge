import { useEffect, useState, type ReactNode } from "react";

interface AppShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onQuickDownload?: () => void;
  canQuickDownload: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
}

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "pdf-viewer-theme";

/**
 * Read the initial theme: persisted preference wins, otherwise fall back
 * to the OS-level prefers-color-scheme. Runs once at mount, so we don't
 * thrash the document attribute on every render.
 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage may be unavailable (private mode); fall through */
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
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
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore quota / privacy errors - theme still applies for the session */
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));

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
            className="btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={theme === "dark"}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
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
