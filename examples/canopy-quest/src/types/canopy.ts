/**
 * Types describing what the Canopy SDK actually returns.
 *
 * The SDK's RPC helpers are deliberately loosely typed (`Record<string, any>`)
 * because node responses vary by version. Everything below is therefore
 * modelled as "these fields may be present" and read defensively in the UI —
 * no field is invented, each one is picked off the raw response only when the
 * node actually sent it.
 */

/** Raw account response from `account()` (/v1/query/account). */
export interface CanopyAccount {
  address?: string;
  amount?: number;
  sequence?: number;
  [key: string]: unknown;
}

/** Raw validator response from `validators()` (/v1/query/validators). */
export interface CanopyValidator {
  address?: string;
  publicKey?: string;
  netAddress?: string;
  stakedAmount?: number;
  committees?: number[];
  maxPausedHeight?: number;
  unstakingHeight?: number;
  output?: string;
  delegate?: boolean;
  compound?: boolean;
  [key: string]: unknown;
}

/** Raw event response from `eventsByAddress()` (/v1/query/events-by-address). */
export interface CanopyEvent {
  height?: number;
  type?: string;
  eventType?: string;
  txHash?: string;
  hash?: string;
  amount?: number;
  address?: string;
  time?: number;
  timestamp?: number;
  [key: string]: unknown;
}

/** Health of a single configured RPC endpoint, as reported by NodePool. */
export interface NodeHealth {
  name: string;
  rpc: string;
  ok: boolean;
  height?: number;
  error?: string;
}

/** Snapshot of the network connection maintained by `useCanopy`. */
export interface NetworkState {
  status: "idle" | "connecting" | "connected" | "error";
  height: number | null;
  endpoint: string | null;
  lastSuccessAt: number | null;
  latencyMs: number | null;
  error: string | null;
}
