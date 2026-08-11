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
