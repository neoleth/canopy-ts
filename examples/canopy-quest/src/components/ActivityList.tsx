import { formatNumber, formatTimestamp, shortenAddress } from "../lib/format";
import type { CanopyEvent } from "../types/canopy";
import { EmptyState } from "./ui";

/**
 * Address events, rendered from whatever the node actually sent. Event shapes
 * differ between node versions, so each field is read defensively and the raw
 * payload stays available for inspection.
 */
export function ActivityList({ events }: { events: CanopyEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        label="No on-chain events for this address yet."
        hint="Receive funds or send a transaction, then refresh."
      />
    );
  }

  return (
    <div className="list">
      <div className="list-row list-head cols-activity">
        <div>Height</div>
        <div>Type</div>
        <div>Amount</div>
        <div>Reference</div>
      </div>

      {events.map((event, index) => {
        const type = event.type ?? event.eventType;
        const hash = event.txHash ?? event.hash;
        const amount = typeof event.amount === "number" ? event.amount : null;
        const time = typeof event.time === "number" ? event.time : event.timestamp;

        return (
          <details key={`${hash ?? "event"}-${index}`} className="list-row cols-activity" style={{ display: "grid" }}>
            <summary style={{ display: "contents", cursor: "pointer" }}>
              <div>
                <span className="cell-label">Height</span>
                <span className="mono">{formatNumber(event.height)}</span>
              </div>
              <div>
                <span className="cell-label">Type</span>
                <span className="badge">{typeof type === "string" && type ? type : "event"}</span>
                {typeof time === "number" && (
                  <div className="small faint">{formatTimestamp(time)}</div>
                )}
              </div>
              <div>
                <span className="cell-label">Amount</span>
                <span className="mono">{amount === null ? "—" : formatNumber(amount)}</span>
              </div>
              <div>
                <span className="cell-label">Reference</span>
                <span className="mono small">
                  {typeof hash === "string" ? shortenAddress(hash, 8) : "—"}
                </span>
              </div>
            </summary>
            <pre
              className="mono small faint"
              style={{ gridColumn: "1 / -1", margin: "8px 0 0", overflowX: "auto", whiteSpace: "pre-wrap" }}
            >
              {JSON.stringify(event, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
