// NEW — src/node-pool.ts
/**
 * Multi-node RPC endpoint management — round-robin automatic failover and
 * pin-to-a-specific-node, matching canopy-mcp's CanopyClient node handling
 * (clients/canopy_client.py). Unlike CanopyClient, NodePool doesn't wrap RPC
 * calls itself — it hands out {baseUrl} RequestOptions for callers to pass
 * into whichever src/rpc.ts function they need (see withFailover in a later
 * task), so it doesn't need updating every time rpc.ts gains a new query.
 */
import { RpcError, TimeoutError } from "./errors.js";
import type { RequestOptions } from "./http.js";
import { fetchHeight } from "./rpc.js";

/** Configuration for a single Canopy node. */
export interface NodeEntry {
  /** Unique identifier, used by selectNode(). */
  name: string;
  /** Public RPC endpoint URL. */
  rpc: string;
  /** Admin RPC endpoint URL (keystore management, etc.) — optional. */
  adminRpc?: string;
  /** Whether this node participates in automatic round-robin. Default true. */
  enabled?: boolean;
}

export class NodePool {
  private nodes: NodeEntry[];
  private currentIndex = 0;
  private pinnedIndex: number | null = null;

  constructor(nodes: NodeEntry[]) {
    this.nodes = nodes.slice();
  }

  /** Every configured node, including disabled ones — for display/inspection. */
  listNodes(): NodeEntry[] {
    return this.nodes.slice();
  }

  private enabledNodes(): NodeEntry[] {
    return this.nodes.filter((n) => n.enabled !== false);
  }

  /** The node the next automatic-mode call would use, or the pinned node if one is set. */
  currentNode(): NodeEntry {
    if (this.pinnedIndex !== null) return this.nodes[this.pinnedIndex];
    const enabled = this.enabledNodes();
    if (enabled.length === 0) throw new Error("NodePool: no enabled nodes configured");
    return enabled[this.currentIndex % enabled.length];
  }

  /**
   * Pin to a specific node by name or 0-based index into the full (including
   * disabled) node list. Disables automatic round-robin until resetNodes().
   */
  selectNode(nameOrIndex: string | number): NodeEntry {
    let index: number;
    if (typeof nameOrIndex === "number") {
      index = nameOrIndex;
      if (index < 0 || index >= this.nodes.length) {
        throw new Error(`Node index out of range: ${nameOrIndex} (have ${this.nodes.length} nodes)`);
      }
    } else {
      index = this.nodes.findIndex((n) => n.name === nameOrIndex);
      if (index === -1) {
        throw new Error(`Node '${nameOrIndex}' not found. Available: ${this.nodes.map((n) => n.name).join(", ")}`);
      }
    }
    this.pinnedIndex = index;
    return this.nodes[index];
  }

  /** Clear any pin and return to automatic round-robin mode. */
  resetNodes(): void {
    this.pinnedIndex = null;
    this.currentIndex = 0;
  }

  /** Append a new node to the pool. */
  addNode(entry: NodeEntry): void {
    this.nodes.push(entry);
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof TimeoutError) return true;
    if (err instanceof RpcError) {
      // status undefined = network-level failure (never reached the server) —
      // retryable. status >= 500 = server error — retryable. 4xx = the
      // request reached a working node and was rejected on its merits —
      // rotating elsewhere won't help and would mask the real error.
      return err.status === undefined || err.status >= 500;
    }
    return true; // unknown error shape (e.g. raw TypeError from fetch) — treat as transient
  }

  /**
   * Run `fn` against the current node, handling automatic-mode rotation or
   * pinned-mode single-node retry. `fn` receives {baseUrl} (and any other
   * RequestOptions this method sets) — pass it straight into an rpc.ts
   * function: `pool.withFailover(opts => fetchHeight(opts))`.
   *
   * Node-local retry (src/http.ts's own retry/backoff) is disabled for calls
   * made through withFailover — rotation across nodes IS the retry strategy
   * here, mirroring canopy-mcp's combined retry+failover loop rather than
   * layering two independent retry mechanisms.
   */
  async withFailover<T>(
    fn: (opts: RequestOptions) => Promise<T>,
    options: { admin?: boolean } = {},
  ): Promise<T> {
    const admin = options.admin ?? false;

    if (this.pinnedIndex !== null) {
      const node = this.nodes[this.pinnedIndex];
      const baseUrl = (admin ? node.adminRpc : undefined) ?? node.rpc;
      try {
        return await fn({ baseUrl, retry: false });
      } catch (e) {
        throw new Error(
          `Pinned node '${node.name}' failed: ${e instanceof Error ? e.message : String(e)}. ` +
            `Call resetNodes() for automatic mode or selectNode() to try a different node.`,
          { cause: e },
        );
      }
    }

    const enabled = this.enabledNodes();
    if (enabled.length === 0) throw new Error("NodePool: no enabled nodes configured");

    let lastError: unknown;
    for (let attempt = 0; attempt < enabled.length; attempt++) {
      const node = enabled[this.currentIndex % enabled.length];
      const baseUrl = (admin ? node.adminRpc : undefined) ?? node.rpc;
      try {
        return await fn({ baseUrl, retry: false });
      } catch (e) {
        lastError = e;
        if (!this.isRetryable(e)) throw e;
        this.currentIndex = (this.currentIndex + 1) % enabled.length;
      }
    }

    throw new Error(
      `All ${enabled.length} RPC endpoints failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      { cause: lastError },
    );
  }

  /**
   * Query /v1/query/height on every configured node (including disabled
   * ones — this is a diagnostic sweep, not automatic-mode routing) and
   * report per-node reachability. Runs concurrently.
   */
  async healthCheckAll(
    opts: { timeoutMs?: number } = {},
  ): Promise<Record<string, { ok: boolean; height?: number; error?: string }>> {
    const entries = await Promise.all(
      this.nodes.map(async (node) => {
        try {
          const height = await fetchHeight({
            baseUrl: node.rpc,
            timeoutMs: opts.timeoutMs ?? 5000,
            retry: false,
          });
          return [node.name, { ok: true, height }] as const;
        } catch (e) {
          return [node.name, { ok: false, error: e instanceof Error ? e.message : String(e) }] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }
}
