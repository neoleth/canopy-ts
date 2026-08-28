import { Trophy } from "lucide-react";
import { getLevelFromXP } from "../lib/quests";
import { shortenAddress } from "../lib/format";

export interface LeaderboardRow {
  rank: number;
  name: string;
  address: string | null;
  xp: number;
  level: number;
  isYou: boolean;
}

/**
 * Local demo leaderboard. These standings live in this browser only — there is
 * no Canopy contract or backend behind them, and the page says so.
 */
export function buildLeaderboard(you: { alias: string; address: string | null; xp: number }): LeaderboardRow[] {
  const demo = [
    { name: "root.canopy", xp: 1850 },
    { name: "leafwarden", xp: 1240 },
    { name: "mossline", xp: 900 },
    { name: "understory", xp: 610 },
    { name: "sapling", xp: 300 },
    { name: "spore", xp: 120 },
  ];

  const rows = [
    ...demo.map((d) => ({ ...d, address: null as string | null, isYou: false })),
    { name: you.alias || "You", xp: you.xp, address: you.address, isYou: true },
  ];

  return rows
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      address: row.address,
      xp: row.xp,
      level: getLevelFromXP(row.xp),
      isYou: row.isYou,
    }));
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="list">
      <div className="list-row list-head cols-leaderboard">
        <div>Rank</div>
        <div>Player</div>
        <div>Address</div>
        <div>XP</div>
      </div>

      {rows.map((row) => (
        <div
          key={`${row.rank}-${row.name}`}
          className="list-row cols-leaderboard"
          style={row.isYou ? { borderColor: "var(--panel-border-strong)", background: "var(--accent-soft)" } : undefined}
        >
          <div>
            <span className="cell-label">Rank</span>
            <span className="row" style={{ gap: 6 }}>
              {row.rank <= 3 && <Trophy size={13} color="var(--accent)" />}#{row.rank}
            </span>
          </div>
          <div>
            <span className="cell-label">Player</span>
            <strong>{row.name}</strong>
            {row.isYou && <span className="badge badge-ok" style={{ marginLeft: 8 }}>You</span>}
            <div className="small faint">Level {row.level}</div>
          </div>
          <div>
            <span className="cell-label">Address</span>
            <span className="mono small">{row.address ? shortenAddress(row.address, 6) : "—"}</span>
          </div>
          <div>
            <span className="cell-label">XP</span>
            <strong className="mono">{row.xp.toLocaleString()}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
