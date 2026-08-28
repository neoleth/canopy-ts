import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity as ActivityIcon, Send, Sparkles, Sword } from "lucide-react";
import { WalletCard } from "../components/WalletCard";
import { NetworkStatus } from "../components/NetworkStatus";
import { XPProgress } from "../components/XPProgress";
import { QuestList } from "../components/QuestList";
import { TransactionModal } from "../components/TransactionModal";
import { Card, Stat } from "../components/ui";
import { useQuests } from "../hooks/useQuests";
import { useWallet } from "../hooks/useWallet";
import { formatRelative, shortenAddress } from "../lib/format";

export function Dashboard() {
  const { session } = useWallet();
  const { summary, level, evidence, streak } = useQuests();
  const [sending, setSending] = useState(false);

  const daily = summary.quests.filter((q) => q.definition.daily);
  const main = summary.quests.filter((q) => !q.definition.daily);

  const recent = [
    evidence.transactions[0] && {
      label: `Transaction ${shortenAddress(evidence.transactions[0].hash, 8)} submitted`,
      at: evidence.transactions[0].at,
    },
    evidence.eventsInspected && {
      label: `Inspected ${evidence.eventsInspected.count} event(s) for your address`,
      at: evidence.eventsInspected.at,
    },
    evidence.validatorsLoaded && {
      label: `Loaded ${evidence.validatorsLoaded.count} validator(s)`,
      at: evidence.validatorsLoaded.at,
    },
    evidence.heightQueried && {
      label: `Read block height ${evidence.heightQueried.height.toLocaleString()}`,
      at: evidence.heightQueried.at,
    },
  ]
    .filter((item): item is { label: string; at: number } => Boolean(item))
    .sort((a, b) => b.at - a.at);

  return (
    <>
      <div className="page-head">
        <h1>{session ? "Welcome back, explorer" : "Welcome to Canopy Quest"}</h1>
        <p>
          {session
            ? "Your progress is verified against real Canopy RPC results."
            : "Connect a wallet to start earning XP for real on-chain activity."}
        </p>
      </div>

      <div className="grid grid-3">
        <Card>
          <Stat
            label="Level"
            value={level.level}
            sub={`${level.xpIntoLevel.toLocaleString()} / ${level.xpForLevel.toLocaleString()} XP to next`}
            icon={<Sparkles size={12} />}
            accent
          />
        </Card>
        <Card>
          <Stat
            label="Total XP"
            value={summary.xp.toLocaleString()}
            sub={streak > 0 ? `${streak} day streak` : "Complete a quest to earn XP"}
            icon={<Sword size={12} />}
          />
        </Card>
        <Card>
          <Stat
            label="Quests complete"
            value={`${summary.completedCount}/${summary.totalCount}`}
            sub={`${summary.totalCount - summary.completedCount} remaining`}
            icon={<ActivityIcon size={12} />}
          />
        </Card>
      </div>

      <div className="grid grid-dash">
        <div className="col" style={{ gap: 16 }}>
          <Card title="Progress" icon={<Sparkles size={16} />}>
            <XPProgress />
          </Card>

          <Card
            title="Daily quests"
            icon={<Sword size={16} />}
            action={
              <Link to="/quests" className="btn btn-sm btn-ghost">
                All quests
              </Link>
            }
          >
            <QuestList quests={daily} />
          </Card>

          <Card title="Main quests" icon={<Sword size={16} />}>
            <QuestList quests={main} />
          </Card>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <WalletCard />
          <NetworkStatus />

          {session && (
            <Card title="Quick actions" icon={<Send size={16} />}>
              <div className="col" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setSending(true)}>
                  <Send size={14} />
                  Send a transaction
                </button>
                <Link to="/validators" className="btn btn-block">
                  Browse validators
                </Link>
                <Link to="/activity" className="btn btn-block">
                  Inspect my activity
                </Link>
              </div>
            </Card>
          )}

          <Card title="Recent activity" icon={<ActivityIcon size={16} />}>
            {recent.length === 0 ? (
              <p className="muted small">
                Nothing yet. Every successful network call you make shows up here.
              </p>
            ) : (
              <div className="col" style={{ gap: 10 }}>
                {recent.map((item) => (
                  <div key={item.label} className="row between small" style={{ gap: 10 }}>
                    <span>{item.label}</span>
                    <span className="faint" style={{ whiteSpace: "nowrap" }}>
                      {formatRelative(item.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {sending && <TransactionModal onClose={() => setSending(false)} />}
    </>
  );
}
