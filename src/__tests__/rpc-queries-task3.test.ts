import { describe, it, expect, vi, afterEach } from "vitest";
import { txByHash, failedTxs } from "../rpc.js";

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

describe("Task 3: txByHash, failedTxs", () => {
  const validAddr40 = "a".repeat(40);
  const validHash64 = "b".repeat(64);

  describe("txByHash()", () => {
    it("queries transaction by 64-char hex hash", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ hash: validHash64, type: "Send", sender: validAddr40 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await txByHash(validHash64, { retry: false });

      expect(result.hash).toBe(validHash64);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/tx-by-hash");
    });

    it("throws on invalid hash length", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ hash: "invalid" })));

      await expect(txByHash("abc", { retry: false })).rejects.toThrow();
      await expect(txByHash("b".repeat(63), { retry: false })).rejects.toThrow();
    });

    it("throws on non-string hash", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})));

      await expect(txByHash(123 as any, { retry: false })).rejects.toThrow();
    });
  });

  describe("failedTxs()", () => {
    it("iterates failed txs for an address, starting at page 1", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [{ hash: "h1" }] })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(failedTxs(validAddr40, { retry: false }));

      expect(result).toEqual([{ hash: "h1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/failed-txs");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
      expect(body.pageNumber).toBe(1);
    });

    it("normalizes address to lowercase without 0x prefix", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(failedTxs(addr, { retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("uses custom page params and stops advancing once a short page is seen", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(failedTxs(validAddr40, {
        pageParams: { page: 3, per_page: 50, order_by: "height", desc: false },
        retry: false,
      }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(50);
      expect(body.orderBy).toBe("height");
      expect(body.desc).toBe(false);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      await expect(collect(failedTxs("invalid", { retry: false }))).rejects.toThrow();
      await expect(collect(failedTxs("0xinvalid", { retry: false }))).rejects.toThrow();
    });

    it("advances pages until a short page ends iteration", async () => {
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.pageNumber === 1) return json({ results: [{ hash: "a" }, { hash: "b" }] });
        return json({ results: [{ hash: "c" }] }); // shorter than per_page=2 -> last page
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(failedTxs(validAddr40, { pageParams: { per_page: 2 }, retry: false }));

      expect(result).toEqual([{ hash: "a" }, { hash: "b" }, { hash: "c" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
