import { describe, it, expect, vi, afterEach } from "vitest";
import { committee, pool, PageParams } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 10: committee, pool", () => {
  describe("committee()", () => {
    it("queries committee members by committee ID with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [], pageNumber: 1 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await committee(1, { retry: false });

      expect(result.results).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/committee");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.committeeID).toBe(1);
      expect(body.pageNumber).toBe(1);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 2, per_page: 50 });
      await committee(1, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await committee(1, { height: 100, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(100);
    });

    it("throws on invalid committee ID", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      expect(committee(-1, { retry: false })).rejects.toThrow();
      expect(committee("invalid" as any, { retry: false })).rejects.toThrow();
    });
  });

  describe("pool()", () => {
    it("queries subsidy pool balance by default", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ balance: 1000000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await pool(1, { retry: false });

      expect(result.balance).toBe(1000000);
      expect(result.pool_id).toBe(1); // 1 + 0 offset for subsidy
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/pool");
    });

    it("queries holding pool with addend 16383", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ balance: 500000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await pool(1, { poolType: "holding", retry: false });

      expect(result.pool_id).toBe(1 + 16383); // holding addend
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(1 + 16383);
    });

    it("queries liquidity pool with addend 32767", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ balance: 750000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await pool(1, { poolType: "liquidity", retry: false });

      expect(result.pool_id).toBe(1 + 32767); // liquidity addend
    });

    it("queries escrow pool with addend 65535", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ balance: 2000000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await pool(1, { poolType: "escrow", retry: false });

      expect(result.pool_id).toBe(1 + 65535); // escrow addend
    });

    it("queries all pool types when poolType is 'all'", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json({ balance: 1000000 }))
        .mockResolvedValueOnce(json({ balance: 500000 }))
        .mockResolvedValueOnce(json({ balance: 750000 }))
        .mockResolvedValueOnce(json({ balance: 2000000 }));

      vi.stubGlobal("fetch", fetchMock);

      const result = await pool(1, { poolType: "all", retry: false });

      expect(result.subsidy).toBeDefined();
      expect(result.subsidy.balance).toBe(1000000);
      expect(result.subsidy.pool_id).toBe(1);

      expect(result.holding).toBeDefined();
      expect(result.holding.balance).toBe(500000);
      expect(result.holding.pool_id).toBe(1 + 16383);

      expect(result.liquidity).toBeDefined();
      expect(result.liquidity.balance).toBe(750000);
      expect(result.liquidity.pool_id).toBe(1 + 32767);

      expect(result.escrow).toBeDefined();
      expect(result.escrow.balance).toBe(2000000);
      expect(result.escrow.pool_id).toBe(1 + 65535);

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("throws on invalid pool type", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ balance: 1000 })));

      expect(pool(1, { poolType: "invalid", retry: false })).rejects.toThrow();
    });
  });
});
