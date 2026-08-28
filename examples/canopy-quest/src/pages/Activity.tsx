import { useCallback, useEffect, useState } from "react";
import { Activity as ActivityIcon, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ActivityList } from "../components/ActivityList";
import { Card, ErrorState, Loading } from "../components/ui";
import { describeError, listAddressEvents } from "../lib/canopy";
import { useQuests } from "../hooks/useQuests";
import { useWallet } from "../hooks/useWallet";
import type { CanopyEvent } from "../types/canopy";
import { formatRelative, shortenAddress } from "../lib/format";

export function Activity() {
  const { session } = useWallet();
  const { recordEvents, evidence } = useQuests();
  const [events, setEvents] = useState<CanopyEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = session?.address ?? null;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const results = await listAddressEvents(address, 50);
      setEvents(results);
      // Completes "Blockchain Explorer" — a real events-by-address response.
      recordEvents(address, results.length);
    } catch (e) {
      setError(describeError(e, "Failed to load activity for this address."));
    } finally {
      setLoading(false);
    }
  }, [address, recordEvents]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <>
        <div className="page-head">
          <h1>Activity</h1>
          <p>Connect a wallet to inspect its on-chain event history.</p>
        </div>
        <Card>
          <div className="col" style={{ gap: 12 }}>
            <p className="muted small">No wallet connected.</p>
            <Link to="/wallet" className="btn btn-primary">
              Set up a wallet
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Activity</h1>
        <p className="mono small">{session.address}</p>
      </div>

      {evidence.transactions.length > 0 && (
        <Card title="Transactions submitted from this app">
          <div className="col" style={{ gap: 8 }}>
            {evidence.transactions.map((tx) => (
              <div key={tx.hash} className="row between small" style={{ gap: 10 }}>
                <span className="mono">{shortenAddress(tx.hash, 10)}</span>
                <span className="faint">{formatRelative(tx.at)}</span>
              </div>
            ))}
            <span className="hint">
              Hashes returned by the node when it accepted each transaction. Inclusion in a block is
              reflected in the on-chain events below.
            </span>
          </div>
        </Card>
      )}

      <Card
        title="On-chain events"
        icon={<ActivityIcon size={16} />}
        action={
          <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      >
        {loading && !events && <Loading label="Querying events…" />}
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {events && !error && <ActivityList events={events} />}
      </Card>
    </>
  );
}
