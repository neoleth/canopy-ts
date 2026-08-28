import { QuestCard } from "./QuestCard";
import type { QuestProgress } from "../types/quest";
import { EmptyState } from "./ui";

export function QuestList({ quests }: { quests: QuestProgress[] }) {
  if (quests.length === 0) return <EmptyState label="No quests here." />;
  return (
    <div className="col" style={{ gap: 10 }}>
      {quests.map((quest) => (
        <QuestCard key={quest.definition.id} quest={quest} />
      ))}
    </div>
  );
}
