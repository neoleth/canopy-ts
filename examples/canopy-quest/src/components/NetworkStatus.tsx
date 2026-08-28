import { useEffect } from "react";
import { Radio, RefreshCw, Server } from "lucide-react";
import { useCanopy } from "../hooks/useCanopy";
import { formatNumber, formatRelative } from "../lib/format";
import { Card } from "./ui";

/**
 * Live view of the RPC connection: status, chain tip, which endpoint answered,
 * how long ago, and per-node health from `NodePool.healthCheckAll`.
 */
export function NetworkStatus({ detailed = false }: { detailed?: boolean }) {
  const { network, nodes, nodesLoading, refresh, checkNodes, config } = useCanopy();

  useEffect(() => {
    if (detailed && nodes.length === 0) void checkNodes();
  }, [detailed, nodes.length, checkNodes]);

  const label =
    network.status === "connected"
      ? "Connected"
      : network.status === "error"
        ? "Disconnected"
        : "Connecting…";
  const dot =
    network.status === "connected" ? "dot ok" : network.status === "error" ? "dot bad" : "dot warn";

  return (
    <Card
      title="Network"
      icon={<Radio size={16} />}
      action={
        <button type="button" className="btn btn-sm" onClick={() => void refresh()}>
          <RefreshCw size={13} />
          Refresh
        </button>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="row between">
          <span className="row" style={{ gap: 8 }}>
            <span className={dot} />
            <strong>{label}</strong>
          </span>
          <span className="badge">{config.networkName}</span>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="stat">
            <span className="stat-label">Block height</span>
            <span className="stat-value accent">{formatNumber(network.height)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Last response</span>
            <span className="stat-value" style={{ fontSize: 18 }}>
              {formatRelative(network.lastSuccessAt)}
            </span>
            <span className="stat-sub">
              {network.latencyMs !== null ? `${network.latencyMs} ms` : "latency unknown"}
            </span>
          </div>
        </div>

        <div className="col small" style={{ gap: 4 }}>
          <span className="faint">Active endpoint</span>
          <span className="mono" style={{ wordBreak: "break-all" }}>
            {network.endpoint ?? "—"}
          </span>
        </div>

        {network.error && <div className="alert alert-error">{network.error}</div>}

        {detailed && (
          <div className="col" style={{ gap: 8 }}>
            <div className="row between">
              <span className="stat-label">
                <Server size={12} /> Configured nodes ({config.nodes.length})
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => void checkNodes()}
                disabled={nodesLoading}
              >
                {nodesLoading ? "Checking…" : "Health check"}
              </button>
            </div>
            {nodes.map((node) => (
              <div key={node.name} className="row between small" style={{ gap: 10 }}>
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span className={node.ok ? "dot ok" : "dot bad"} />
                  <span className="mono" style={{ wordBreak: "break-all" }}>
                    {node.rpc}
                  </span>
                </span>
                <span className="faint" style={{ whiteSpace: "nowrap" }}>
                  {node.ok ? `height ${formatNumber(node.height)}` : "unreachable"}
                </span>
              </div>
            ))}
            {nodes.length === 0 && !nodesLoading && (
              <span className="hint">Run a health check to test every configured endpoint.</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
