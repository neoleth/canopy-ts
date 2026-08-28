import { Sword } from "lucide-react";
import { QuestList } from "../components/QuestList";
import { XPProgress } from "../components/XPProgress";
import { Card } from "../components/ui";
import { useQuests } from "../hooks/useQuests";

export function Quests() {
  const { summary, streak, evidence } = useQuests();
  const daily = summary.quests.filter((q) => q.definition.daily);
  const main = summary.quests.filter((q) => !q.definition.daily);

  return (
    <>
      <div className="page-head">
        <h1>Quests</h1>
        <p>
          Quests complete themselves when the underlying Canopy call actually succeeds — there is no
          "claim" button to game.
        </p>
      </div>

      <Card title="Your progress" icon={<Sword size={16} />}>
        <XPProgress />
      </Card>

      <Card title="Daily">
        <div className="col" style={{ gap: 12 }}>
          <p className="small muted">
            Resets at 00:00 UTC. Earned {evidence.networkDaysUTC.length} time(s) so far
            {streak > 0 ? ` · current streak ${streak} day(s)` : ""}.
          </p>
          <QuestList quests={daily} />
        </div>
      </Card>

      <Card title="Main quests">
        <QuestList quests={main} />
      </Card>
    </>
  );
}
