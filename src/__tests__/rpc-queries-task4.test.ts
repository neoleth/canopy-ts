import { describe, it, expect, vi, afterEach } from "vitest";
import { txsByHeight, txsBySender, txsByRecipient } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) items.push(item);
  return items;
}

afterEach(() => vi.restoreAllMocks());

describe("Task 4: txsByHeight, txsBySender, txsByRecipient", () => {
  const validAddr40 = "a".repeat(40);

  describe("txsByHeight()", () => {
    it("iterates txs at a specific height with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ hash: "h1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(txsByHeight(42, { retry: false }));

      expect(result).toEqual([{ hash: "h1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/txs-by-height");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(42);
      expect(body.pageNumber).toBe(1);
    });

    it("queries latest height when height is 0", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(txsByHeight(0, { retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(txsByHeight(100, { pageParams: { page: 2, per_page: 50 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });
  });

  describe("txsBySender()", () => {
    it("iterates txs sent by address with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ hash: "h1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(txsBySender(validAddr40, { retry: false }));

      expect(result).toEqual([{ hash: "h1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/txs-by-sender");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
    });

    it("normalizes 0x-prefixed addresses", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(txsBySender(addr, { retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      await expect(collect(txsBySender("invalid", { retry: false }))).rejects.toThrow();
    });
  });

  describe("txsByRecipient()", () => {
    it("iterates txs received by address", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ hash: "h1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(txsByRecipient(validAddr40, { retry: false }));

      expect(result).toEqual([{ hash: "h1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/txs-by-rec");
    });

    it("uses page params correctly", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(txsByRecipient(validAddr40, { pageParams: { page: 3, per_page: 100 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(100);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      await expect(collect(txsByRecipient("0xinvalid", { retry: false }))).rejects.toThrow();
    });

    it("advances pages until a short page ends iteration", async () => {
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.pageNumber === 1) return json({ results: [{ hash: "a" }, { hash: "b" }] });
        return json({ results: [{ hash: "c" }] });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(txsByRecipient(validAddr40, { pageParams: { per_page: 2 }, retry: false }));

      expect(result).toEqual([{ hash: "a" }, { hash: "b" }, { hash: "c" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
