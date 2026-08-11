// src/__tests__/node-pool.test.ts
import { describe, it, expect } from "vitest";
import { NodePool } from "../node-pool.js";

const NODES = [
  { name: "dev-node-1", rpc: "http://node1:50002", adminRpc: "http://node1:50003" },
  { name: "dev-node-2", rpc: "http://node2:50002", adminRpc: "http://node2:50003" },
  { name: "dev-node-3", rpc: "http://node3:50002", adminRpc: "http://node3:50003", enabled: false },
];

describe("NodePool — list/current/select/reset/add", () => {
  it("listNodes returns every configured node, including disabled ones", () => {
    const pool = new NodePool(NODES);
    expect(pool.listNodes()).toEqual(NODES);
  });

  it("currentNode defaults to the first enabled node in automatic mode", () => {
    const pool = new NodePool(NODES);
    expect(pool.currentNode().name).toBe("dev-node-1");
  });

  it("currentNode skips disabled nodes", () => {
    const pool = new NodePool([{ name: "a", rpc: "http://a", enabled: false }, { name: "b", rpc: "http://b" }]);
    expect(pool.currentNode().name).toBe("b");
  });

  it("selectNode by name pins to that node", () => {
    const pool = new NodePool(NODES);
    const selected = pool.selectNode("dev-node-2");
    expect(selected.name).toBe("dev-node-2");
    expect(pool.currentNode().name).toBe("dev-node-2");
  });

  it("selectNode by index pins to that node", () => {
    const pool = new NodePool(NODES);
    const selected = pool.selectNode(1);
    expect(selected.name).toBe("dev-node-2");
  });

  it("selectNode throws on an unknown name", () => {
    const pool = new NodePool(NODES);
    expect(() => pool.selectNode("nonexistent")).toThrow(/not found/);
  });

  it("selectNode throws on an out-of-range index", () => {
    const pool = new NodePool(NODES);
    expect(() => pool.selectNode(99)).toThrow(/out of range/);
  });

  it("resetNodes clears the pin and returns to automatic mode", () => {
    const pool = new NodePool(NODES);
    pool.selectNode("dev-node-2");
    pool.resetNodes();
    expect(pool.currentNode().name).toBe("dev-node-1");
  });

  it("addNode appends a new node to the pool", () => {
    const pool = new NodePool(NODES);
    pool.addNode({ name: "dev-node-4", rpc: "http://node4:50002" });
    expect(pool.listNodes()).toHaveLength(4);
    expect(pool.listNodes()[3].name).toBe("dev-node-4");
  });

  it("currentNode throws when there are no enabled nodes", () => {
    const pool = new NodePool([{ name: "a", rpc: "http://a", enabled: false }]);
    expect(() => pool.currentNode()).toThrow(/no enabled nodes/);
  });
});

// APPEND — src/__tests__/node-pool.test.ts
import { RpcError, TimeoutError } from "../errors.js";
import { fetchHeight } from "../rpc.js";
import { vi, afterEach } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("NodePool.withFailover — automatic mode", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the first enabled node when it succeeds", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2" },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ height: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const height = await pool.withFailover((opts) => fetchHeight(opts));

    expect(height).toBe(42);
    expect(fetchMock.mock.calls[0][0]).toBe("http://n1/v1/query/height");
  });

  it("rotates to the next enabled node on a connection failure", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2" },
    ]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ height: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    const height = await pool.withFailover((opts) => fetchHeight(opts));

    expect(height).toBe(7);
    expect(fetchMock.mock.calls[0][0]).toBe("http://n1/v1/query/height");
    expect(fetchMock.mock.calls[1][0]).toBe("http://n2/v1/query/height");
  });

  it("rotates on a 5xx response", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2" },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ height: 9 }));
    vi.stubGlobal("fetch", fetchMock);

    const height = await pool.withFailover((opts) => fetchHeight(opts));

    expect(height).toBe(9);
  });

  it("does NOT rotate on a 4xx response — propagates immediately", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2" },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pool.withFailover((opts) => fetchHeight(opts))).rejects.toThrow(RpcError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no rotation attempted
  });

  it("skips disabled nodes when rotating", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2", enabled: false },
      { name: "n3", rpc: "http://n3" },
    ]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ height: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    const height = await pool.withFailover((opts) => fetchHeight(opts));

    expect(height).toBe(3);
    expect(fetchMock.mock.calls[1][0]).toBe("http://n3/v1/query/height"); // skipped n2
  });

  it("throws after exhausting every enabled node", async () => {
    const pool = new NodePool([
      { name: "n1", rpc: "http://n1" },
      { name: "n2", rpc: "http://n2" },
    ]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(pool.withFailover((opts) => fetchHeight(opts))).rejects.toThrow(/All \d+ RPC endpoints failed/);
  });

  it("uses adminRpc when admin: true is passed", async () => {
    const pool = new NodePool([{ name: "n1", rpc: "http://n1", adminRpc: "http://n1-admin" }]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ height: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await pool.withFailover((opts) => fetchHeight(opts), { admin: true });

    expect(fetchMock.mock.calls[0][0]).toBe("http://n1-admin/v1/query/height");
  });
});
