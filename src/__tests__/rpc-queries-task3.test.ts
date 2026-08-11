import { describe, it, expect, vi, afterEach } from "vitest";
import { txByHash, failedTxs, PageParams } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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

      expect(txByHash("abc", { retry: false })).rejects.toThrow();
      expect(txByHash("b".repeat(63), { retry: false })).rejects.toThrow();
    });

    it("throws on non-string hash", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})));

      expect(txByHash(123 as any, { retry: false })).rejects.toThrow();
    });
  });

  describe("failedTxs()", () => {
    it("queries failed txs for an address at page 1", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ failedTxs: [], pageNumber: 1, perPage: 20 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await failedTxs(validAddr40, { retry: false });

      expect(result.failedTxs).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/failed-txs");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
      expect(body.pageNumber).toBe(1);
    });

    it("normalizes address to lowercase without 0x prefix", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ failedTxs: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await failedTxs(addr, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ failedTxs: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 3, per_page: 50, order_by: "height", desc: false });
      await failedTxs(validAddr40, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(50);
      expect(body.orderBy).toBe("height");
      expect(body.desc).toBe(false);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ failedTxs: [] })));

      expect(failedTxs("invalid", { retry: false })).rejects.toThrow();
      expect(failedTxs("0xinvalid", { retry: false })).rejects.toThrow();
    });
  });
});
