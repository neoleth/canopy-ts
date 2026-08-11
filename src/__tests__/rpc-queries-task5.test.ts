import { describe, it, expect, vi, afterEach } from "vitest";
import { pending, accountsBatch } from "../rpc.js";

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

describe("Task 5: pending, accountsBatch", () => {
  const validAddr40 = "a".repeat(40);

  describe("pending()", () => {
    it("iterates unconfirmed mempool transactions with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ hash: "h1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(pending({ retry: false }));

      expect(result).toEqual([{ hash: "h1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/pending");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(1);
      expect(body.perPage).toBe(20);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(pending({ pageParams: { page: 2, per_page: 50 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });
  });

  describe("accountsBatch()", () => {
    it("queries multiple accounts concurrently", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json({ address: validAddr40, balance: 100 }))
        .mockResolvedValueOnce(json({ address: "b".repeat(40), balance: 200 }));

      vi.stubGlobal("fetch", fetchMock);

      const addresses = [validAddr40, "b".repeat(40)];
      const result = await accountsBatch(addresses, { retry: false });

      expect(result).toHaveLength(2);
      expect(result[0].address).toBe(validAddr40);
      expect(result[0].balance).toBe(100);
      expect(result[1].address).toBe("b".repeat(40));
      expect(result[1].balance).toBe(200);
    });

    it("includes address field in results", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ balance: 500 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await accountsBatch([validAddr40], { retry: false });

      expect(result[0].address).toBe(validAddr40);
    });

    it("handles errors gracefully without failing other queries", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json({ address: validAddr40, balance: 100 }))
        .mockRejectedValueOnce(new Error("Network error"));

      vi.stubGlobal("fetch", fetchMock);

      const addresses = [validAddr40, "b".repeat(40)];
      const result = await accountsBatch(addresses, { retry: false });

      expect(result).toHaveLength(2);
      expect(result[0].address).toBe(validAddr40);
      expect(result[0].balance).toBe(100);
      expect(result[1].address).toBe("b".repeat(40));
      expect(result[1].error).toBeDefined();
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ balance: 100 }));
      vi.stubGlobal("fetch", fetchMock);

      await accountsBatch([validAddr40], { height: 42, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(42);
    });
  });
});
