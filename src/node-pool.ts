// NEW — src/node-pool.ts
/**
 * Multi-node RPC endpoint management — round-robin automatic failover and
 * pin-to-a-specific-node, matching canopy-mcp's CanopyClient node handling
 * (clients/canopy_client.py). Unlike CanopyClient, NodePool doesn't wrap RPC
 * calls itself — it hands out {baseUrl} RequestOptions for callers to pass
 * into whichever src/rpc.ts function they need (see withFailover in a later
 * task), so it doesn't need updating every time rpc.ts gains a new query.
 */

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
}
