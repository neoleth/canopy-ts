import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { ValidatorList } from "../components/ValidatorList";
import { Card, ErrorState, Loading } from "../components/ui";
import { describeError, listValidators } from "../lib/canopy";
import { useQuests } from "../hooks/useQuests";
import type { CanopyValidator } from "../types/canopy";
import { formatNumber } from "../lib/format";

export function Validators() {
  const { recordValidators } = useQuests();
  const [validators, setValidators] = useState<CanopyValidator[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await listValidators(100);
      setValidators(results);
      // Completes "Validator Scout" — only ever called after a real response.
      recordValidators(results.length);
    } catch (e) {
      setError(describeError(e, "Failed to load the validator set."));
    } finally {
      setLoading(false);
    }
  }, [recordValidators]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalStake = (validators ?? []).reduce(
    (sum, v) => sum + (typeof v.stakedAmount === "number" ? v.stakedAmount : 0),
    0,
  );

  return (
    <>
      <div className="page-head">
        <h1>Validators</h1>
        <p>Queried live from the Canopy node via the SDK's paginated `validators` endpoint.</p>
      </div>

      <Card
        title={validators ? `${validators.length} validator(s)` : "Validator set"}
        icon={<ShieldCheck size={16} />}
        action={
          <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      >
        <div className="col" style={{ gap: 14 }}>
          {validators && validators.length > 0 && (
            <div className="row row-wrap small muted" style={{ gap: 16 }}>
              <span>Total staked (base units): {formatNumber(totalStake)}</span>
              <span>Showing up to 100 records</span>
            </div>
          )}

          {loading && !validators && <Loading label="Querying validators…" />}
          {error && <ErrorState message={error} onRetry={() => void load()} />}
          {validators && !error && <ValidatorList validators={validators} />}
        </div>
      </Card>
    </>
  );
}
