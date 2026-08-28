import { useMemo } from "react";
import { Info, Trophy } from "lucide-react";
import { Leaderboard, buildLeaderboard } from "../components/Leaderboard";
import { Card } from "../components/ui";
import { useQuests } from "../hooks/useQuests";
import { useWallet } from "../hooks/useWallet";

export function LeaderboardPage() {
  const { summary, alias, setAlias } = useQuests();
  const { session } = useWallet();

  const rows = useMemo(
    () => buildLeaderboard({ alias, address: session?.address ?? null, xp: summary.xp }),
    [alias, session?.address, summary.xp],
  );

  return (
    <>
      <div className="page-head">
        <h1>Leaderboard</h1>
        <p>Local demo standings — see the note below before you read anything into them.</p>
      </div>

      <div className="alert alert-warn">
        <Info size={16} style={{ flex: "none", marginTop: 1 }} />
        <div>
          <strong>Local Demo Leaderboard.</strong> Your row is computed from XP stored in this
          browser; the other players are fixed demo entries. None of this is stored on Canopy — there
          is no contract or backend behind it.
        </div>
      </div>

      <Card title="Standings" icon={<Trophy size={16} />}>
        <div className="col" style={{ gap: 14 }}>
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="alias">Your display name</label>
            <input
              id="alias"
              className="input"
              value={alias}
              maxLength={24}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
          <Leaderboard rows={rows} />
        </div>
      </Card>
    </>
  );
}
