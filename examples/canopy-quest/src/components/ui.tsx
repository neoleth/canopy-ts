/** Small shared presentational primitives. */
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function Card({
  title,
  icon,
  action,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {title && (
        <header className="card-head">
          {icon && <span className="card-title-icon">{icon}</span>}
          <h3>{title}</h3>
          <span className="spacer" />
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state">
      <Loader2 className="spinner" size={18} style={{ border: "none", animation: "spin 0.8s linear infinite" }} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="state">
      <Inbox size={22} />
      <span>{label}</span>
      {hint && <span className="small faint">{hint}</span>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error">
      <AlertTriangle size={16} style={{ flex: "none", marginTop: 1 }} />
      <div className="col" style={{ gap: 8 }}>
        <span>{message}</span>
        {onRetry && (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat">
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className={accent ? "stat-value accent" : "stat-value"}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
