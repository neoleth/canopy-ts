import { formatNumber, shortenAddress } from "../lib/format";
import type { CanopyValidator } from "../types/canopy";
import { EmptyState } from "./ui";
import { CopyButton } from "./CopyButton";

/**
 * Validators as the node returned them. Only fields actually present on a
 * record are rendered — nothing is invented or defaulted to a fake value.
 */
export function ValidatorList({ validators }: { validators: CanopyValidator[] }) {
  if (validators.length === 0) {
    return <EmptyState label="This node reported no validators." hint="The set may be empty at this height." />;
  }

  return (
    <div className="list">
      <div className="list-row list-head cols-validator">
        <div>Address</div>
        <div>Staked</div>
        <div>Committees</div>
        <div>Status</div>
      </div>

      {validators.map((validator, index) => {
        const address = typeof validator.address === "string" ? validator.address : null;
        const staked = typeof validator.stakedAmount === "number" ? validator.stakedAmount : null;
        const committees = Array.isArray(validator.committees) ? validator.committees : null;
        const unstaking =
          typeof validator.unstakingHeight === "number" && validator.unstakingHeight > 0;
        const paused = typeof validator.maxPausedHeight === "number" && validator.maxPausedHeight > 0;

        return (
          <div key={address ?? index} className="list-row cols-validator">
            <div className="col" style={{ gap: 4 }}>
              <span className="cell-label">Address</span>
              <span className="row" style={{ gap: 6 }}>
                <span className="mono">{address ? shortenAddress(address, 8) : "unknown"}</span>
                {address && <CopyButton value={address} label="" />}
              </span>
              {typeof validator.netAddress === "string" && validator.netAddress && (
                <span className="small faint mono" style={{ wordBreak: "break-all" }}>
                  {validator.netAddress}
                </span>
              )}
            </div>

            <div>
              <span className="cell-label">Staked</span>
              <span className="mono">{staked === null ? "—" : formatNumber(staked)}</span>
            </div>

            <div>
              <span className="cell-label">Committees</span>
              {committees && committees.length > 0 ? (
                <span className="row row-wrap" style={{ gap: 4 }}>
                  {committees.map((id) => (
                    <span key={id} className="badge">
                      {id}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="faint">—</span>
              )}
            </div>

            <div>
              <span className="cell-label">Status</span>
              {unstaking ? (
                <span className="badge badge-warn">Unstaking</span>
              ) : paused ? (
                <span className="badge badge-danger">Paused</span>
              ) : (
                <span className="badge badge-ok">Active</span>
              )}
              {validator.delegate === true && <span className="badge">Delegate</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
