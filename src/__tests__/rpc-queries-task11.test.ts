import { describe, it, expect, vi, afterEach } from "vitest";
import { nextDexBatch, orders, PageParams } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 11: nextDexBatch, orders", () => {
  describe("nextDexBatch()", () => {
    it("queries the not-yet-locked DEX batch for a committee", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ deposits: [], withdrawals: [], batchHeight: 100 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await nextDexBatch(1, { retry: false });

      expect(result.deposits).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/next-dex-batch");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(1);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ deposits: [], withdrawals: [] })
      );
      vi.stubGlobal("fetch", fetchMock);

      await nextDexBatch(1, { height: 100, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(100);
    });

    it("queries DEX batch for a specific chain/committee", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ deposits: [{ account: "addr", amount: 1000 }] })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await nextDexBatch(5, { retry: false });

      expect(result.deposits).toHaveLength(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(5);
    });
  });

  describe("orders()", () => {
    it("lists open DEX sell orders for a committee with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [{ id: "order1", account: "addr1" }], pageNumber: 1 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await orders(1, { retry: false });

      expect(result.results).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/orders");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.committee).toBe(1);
      expect(body.pageNumber).toBe(1);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 2, per_page: 50 });
      await orders(1, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });

    it("queries orders at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await orders(1, { height: 150, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(150);
    });

    it("includes order IDs matching those for edit/delete operations", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({
          results: [
            { id: "abc123", account: "addr1", price: 100 },
            { id: "def456", account: "addr2", price: 200 },
          ],
          pageNumber: 1,
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await orders(1, { retry: false });

      expect(result.results[0].id).toBe("abc123");
      expect(result.results[1].id).toBe("def456");
    });

    it("queries orders for a specific committee", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await orders(7, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.committee).toBe(7);
    });
  });
});
