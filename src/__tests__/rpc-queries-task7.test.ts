import { describe, it, expect, vi, afterEach } from "vitest";
import { eventsByAddress, eventsByChain, eventsByHeight, PageParams } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 7: eventsByAddress, eventsByChain, eventsByHeight", () => {
  const validAddr40 = "a".repeat(40);

  describe("eventsByAddress()", () => {
    it("queries events for an address with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [], pageNumber: 1 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await eventsByAddress(validAddr40, { retry: false });

      expect(result.results).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-address");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
    });

    it("normalizes 0x-prefixed addresses", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await eventsByAddress(addr, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 2, per_page: 50 });
      await eventsByAddress(validAddr40, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      expect(eventsByAddress("invalid", { retry: false })).rejects.toThrow();
    });
  });

  describe("eventsByChain()", () => {
    it("queries events for a chain/committee ID with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [], pageNumber: 1 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await eventsByChain(1, { retry: false });

      expect(result.results).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-chain");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(1);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 3, per_page: 100 });
      await eventsByChain(1, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(100);
    });

    it("throws on invalid chain ID", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      expect(eventsByChain(-1, { retry: false })).rejects.toThrow();
      expect(eventsByChain("invalid" as any, { retry: false })).rejects.toThrow();
    });
  });

  describe("eventsByHeight()", () => {
    it("queries events at a specific block height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ results: [], pageNumber: 1 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await eventsByHeight(42, { retry: false });

      expect(result.results).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-height");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(42);
    });

    it("queries latest committed height when height is 0", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await eventsByHeight(0, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pageParams = new PageParams({ page: 2, per_page: 50, desc: false });
      await eventsByHeight(100, { pageParams, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
      expect(body.desc).toBe(false);
    });
  });
});
