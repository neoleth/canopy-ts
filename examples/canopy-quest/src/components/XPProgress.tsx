import { Sparkles, Star } from "lucide-react";
import { useQuests } from "../hooks/useQuests";

/** Level chip + XP bar. Values come from the derived level info, never state. */
export function XPProgress({ compact = false }: { compact?: boolean }) {
  const { level, summary, streak } = useQuests();

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="xp-head">
        <span className="level-chip">
          <Star size={12} />
          Level {level.level}
        </span>
        <span className="small muted">
          {level.xpIntoLevel.toLocaleString()} / {level.xpForLevel.toLocaleString()} XP to level{" "}
          {level.level + 1}
        </span>
      </div>

      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>

      {!compact && (
        <div className="row between small muted">
          <span>{summary.xp.toLocaleString()} total XP</span>
          <span>
            {summary.completedCount}/{summary.totalCount} quests
            {streak > 0 && ` · ${streak} day streak`}
          </span>
        </div>
      )}
    </div>
  );
}

/** Floating "+XP" notifications emitted when a quest actually completes. */
export function XPToasts() {
  const { toasts, dismissToast } = useQuests();
  if (toasts.length === 0) return null;

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" className="toast" onClick={() => dismissToast(toast.id)}>
          <Sparkles size={18} color="var(--accent)" />
          <span className="col" style={{ gap: 2, alignItems: "flex-start" }}>
            <span className="toast-xp">+{toast.xp} XP</span>
            <span className="toast-title">{toast.title}</span>
            {toast.levelUp && <span className="toast-sub">Level {toast.levelUp} reached!</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
