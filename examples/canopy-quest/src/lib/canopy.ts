/**
 * Canopy network access layer.
 *
 * Everything blockchain-related goes through this module: it owns the
 * `NodePool` (multi-endpoint failover), wraps the SDK's RPC helpers, and
 * publishes an observable record of every successful call so the UI can show
 * live connection state and the quest engine can verify real results.
 *
 * Only SDK APIs are used here — see @canopynetwork/canopy-ts:
 *   rpc:          fetchHeight, account, validators, eventsByAddress, fees,
 *                 supply, submitTx
 *   node-pool:    NodePool.withFailover / healthCheckAll
 *   transaction:  createAndSignTransaction
 *   errors:       CanopyError, RpcError, TimeoutError, ResponseValidationError
 */
import { NodePool } from "@canopynetwork/canopy-ts/node-pool";
import type { NodeEntry } from "@canopynetwork/canopy-ts/node-pool";
import {
  account as rpcAccount,
  eventsByAddress,
  fees as rpcFees,
  fetchHeight,
  submitTx,
  supply as rpcSupply,
  validators as rpcValidators,
} from "@canopynetwork/canopy-ts/rpc";
import type { RequestOptions } from "@canopynetwork/canopy-ts/rpc";
import {
  CanopyError,
  ResponseValidationError,
  RpcError,
  TimeoutError,
} from "@canopynetwork/canopy-ts/errors";
import { createAndSignTransaction } from "@canopynetwork/canopy-ts/transaction";
import type { CurveType } from "@canopynetwork/canopy-ts/crypto";
import type { CanopyAccount, CanopyEvent, CanopyValidator, NodeHealth } from "../types/canopy";

// --- configuration ---------------------------------------------------------

/**
 * All of these are public values (VITE_* variables ship to the browser).
 * Never put a secret here.
 */
function envString(key: string, fallback: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function envNumber(key: string, fallback: number): number {
  // envString already collapses unset/blank to the fallback, so an empty
  // variable can never be read as 0.
  const parsed = Number(envString(key, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Comma-separated list: first entry is primary, the rest are failover nodes. */
function configuredNodes(): NodeEntry[] {
  const raw = envString("VITE_CANOPY_RPC_URL", "http://localhost:50002");
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return urls.map((rpc, i) => ({
    name: i === 0 ? "primary" : `fallback-${i}`,
    rpc,
  }));
}

export const networkConfig = {
  nodes: configuredNodes(),
  networkName: envString("VITE_CANOPY_NETWORK", "canopy"),
  networkID: envNumber("VITE_CANOPY_NETWORK_ID", 1),
  chainID: envNumber("VITE_CANOPY_CHAIN_ID", 1),
  /** Decimals between the display unit and the chain's smallest unit. */
  denomExponent: envNumber("VITE_CANOPY_DENOM_EXPONENT", 6),
  denomSymbol: envString("VITE_CANOPY_DENOM_SYMBOL", "CNPY"),
  /** Used only if the node does not report a send fee. */
  fallbackSendFee: envNumber("VITE_CANOPY_FALLBACK_SEND_FEE", 10000),
} as const;

export const pool = new NodePool(networkConfig.nodes);

// --- observable call log ---------------------------------------------------

export interface RpcObservation {
  label: string;
  endpoint: string;
  latencyMs: number;
  at: number;
}

type Listener = (obs: RpcObservation) => void;
const listeners = new Set<Listener>();

/** Subscribe to successful RPC calls. Returns an unsubscribe function. */
export function onRpcSuccess(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(obs: RpcObservation): void {
  for (const listener of listeners) {
    try {
      listener(obs);
    } catch (e) {
      console.error("canopy-quest: RPC listener threw", e);
    }
  }
}

/**
 * Run one SDK call through the pool, timing it and reporting success.
 * `NodePool.withFailover` rotates to the next node on connection/timeout/5xx
 * failures and propagates 4xx immediately (a 4xx is not a node-health signal).
 */
async function call<T>(label: string, fn: (opts: RequestOptions) => Promise<T>): Promise<T> {
  const started = Date.now();
  let endpoint = pool.currentNode().rpc;
  const result = await pool.withFailover((opts) => {
    endpoint = opts.baseUrl ?? endpoint;
    return fn(opts);
  });
  publish({ label, endpoint, latencyMs: Date.now() - started, at: Date.now() });
  return result;
}

// --- error handling --------------------------------------------------------

/**
 * Turn any thrown value into a message safe to show a user. The raw error is
 * still logged so it is available in the console during development.
 */
export function describeError(error: unknown, fallback = "Something went wrong."): string {
  console.error("canopy-quest:", error);

  if (error instanceof TimeoutError) {
    return `The Canopy node did not respond within ${Math.round(error.timeoutMs / 1000)}s.`;
  }
  if (error instanceof RpcError) {
    if (error.status === undefined) return "Unable to reach the Canopy network.";
    if (error.status === 404) return "This Canopy node does not support that query.";
    if (error.status === 429) return "The Canopy node is rate limiting requests. Try again shortly.";
    if (error.status >= 500) return "The Canopy node reported a server error.";
    return `The Canopy node rejected the request (HTTP ${error.status}).`;
  }
  if (error instanceof ResponseValidationError) {
    return "The Canopy node returned a response this app could not understand.";
  }
  if (error instanceof CanopyError) {
    return error.message;
  }
  if (error instanceof Error && /All \d+ RPC endpoints failed/.test(error.message)) {
    return "Unable to connect to Canopy network — every configured RPC endpoint failed.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// --- queries ---------------------------------------------------------------

export async function getHeight(): Promise<number> {
  return call("height", (opts) => fetchHeight(opts));
}

export async function getAccount(address: string): Promise<CanopyAccount> {
  return call("account", (opts) => rpcAccount(address, opts)) as Promise<CanopyAccount>;
}

export async function getSupply(): Promise<Record<string, unknown>> {
  return call("supply", (opts) => rpcSupply(opts));
}

/** Collect up to `limit` validators from the SDK's paginating generator. */
export async function listValidators(limit = 100): Promise<CanopyValidator[]> {
  return call("validators", async (opts) => {
    const out: CanopyValidator[] = [];
    for await (const v of rpcValidators({ ...opts, pageParams: { per_page: 50 } })) {
      out.push(v as CanopyValidator);
      if (out.length >= limit) break;
    }
    return out;
  });
}

/** Collect up to `limit` events for an address from the paginating generator. */
export async function listAddressEvents(address: string, limit = 50): Promise<CanopyEvent[]> {
  return call("events", async (opts) => {
    const out: CanopyEvent[] = [];
    for await (const e of eventsByAddress(address, { ...opts, pageParams: { per_page: 25 } })) {
      out.push(e as CanopyEvent);
      if (out.length >= limit) break;
    }
    return out;
  });
}

export interface SendFee {
  micro: number;
  /** Whether the node actually reported a send fee, or we fell back to config. */
  source: "network" | "fallback";
}

/**
 * Read the network's send fee. The node reports fee params under `sendFee`
 * (confirmed against the SDK's devnet e2e suite); older nodes may snake-case
 * it, so both spellings are accepted before falling back to configuration.
 */
export async function getSendFee(): Promise<SendFee> {
  const params = await call("fees", (opts) => rpcFees(opts));
  const raw = params?.sendFee ?? params?.send_fee;
  const micro = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(micro) && micro >= 0) return { micro, source: "network" };
  return { micro: networkConfig.fallbackSendFee, source: "fallback" };
}

export async function healthCheck(): Promise<NodeHealth[]> {
  const report = await pool.healthCheckAll({ timeoutMs: 5000 });
  return pool.listNodes().map((node) => ({
    name: node.name,
    rpc: node.rpc,
    ok: report[node.name]?.ok ?? false,
    height: report[node.name]?.height,
    error: report[node.name]?.error,
  }));
}

// --- transactions ----------------------------------------------------------

export interface SendTransactionArgs {
  fromAddress: string;
  toAddress: string;
  /** Amount in the chain's smallest unit. */
  amountMicro: number;
  feeMicro: number;
  memo?: string;
  privateKeyHex: string;
  publicKeyHex: string;
  curveType: CurveType;
}

/**
 * Build, sign, and broadcast a `send`.
 *
 * `send` is a registered core message type, so the transaction must use the
 * SDK's "core" output format — the node's registered path requires a protojson
 * `msg` field and ignores msgTypeUrl/msgBytes.
 */
export async function sendTransaction(args: SendTransactionArgs): Promise<string> {
  const height = await getHeight();

  const tx = createAndSignTransaction(
    {
      type: "send",
      msg: {
        fromAddress: args.fromAddress,
        toAddress: args.toAddress,
        amount: args.amountMicro,
      },
      fee: args.feeMicro,
      memo: args.memo,
      networkID: networkConfig.networkID,
      chainID: networkConfig.chainID,
      height,
    },
    args.privateKeyHex,
    args.publicKeyHex,
    args.curveType,
    { format: "core" },
  );

  const response = await call("submitTx", (opts) => submitTx(tx, opts));
  return extractTxHash(response);
}

/**
 * /v1/tx answers with a bare JSON string (the tx hash) on the nodes the SDK's
 * e2e suite exercises; some node versions wrap it in {txHash} or {hash}.
 * Anything else means we cannot honestly claim the transaction landed.
 */
export function extractTxHash(response: unknown): string {
  if (typeof response === "string" && response.length > 0) return response;
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    const hash = obj.txHash ?? obj.hash ?? obj.tx_hash;
    if (typeof hash === "string" && hash.length > 0) return hash;
  }
  throw new Error("The node accepted the request but returned no transaction hash.");
}
