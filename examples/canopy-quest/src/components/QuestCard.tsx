import { Check, Clock, Lock } from "lucide-react";
import type { QuestProgress } from "../types/quest";
import { formatRelative } from "../lib/format";

/** A single quest row. Status is derived from evidence — never clickable. */
export function QuestCard({ quest }: { quest: QuestProgress }) {
  const done = quest.status === "completed";

  return (
    <article className={done ? "quest done" : "quest"}>
      <span className="quest-check">
        {done ? <Check size={15} /> : quest.definition.daily ? <Clock size={14} /> : <Lock size={13} />}
      </span>

      <div className="quest-body">
        <div className="quest-title">
          {quest.definition.title}
          {quest.definition.daily && <span className="badge">Daily · resets 00:00 UTC</span>}
          {done && <span className="badge badge-ok">Complete</span>}
        </div>
        <p className="quest-desc">{quest.definition.description}</p>
        <div className="row row-wrap small faint" style={{ gap: 12 }}>
          <span>Goal: {quest.definition.requirement}</span>
          {quest.target > 1 && (
            <span>
              {quest.progress}/{quest.target}
            </span>
          )}
          {done && quest.completedAt ? <span>Completed {formatRelative(quest.completedAt)}</span> : null}
        </div>
      </div>

      <span className="quest-xp">+{quest.definition.xp} XP</span>
    </article>
  );
}
