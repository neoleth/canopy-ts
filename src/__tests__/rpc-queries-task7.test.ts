import { describe, it, expect, vi, afterEach } from "vitest";
import { eventsByAddress, eventsByChain, eventsByHeight } from "../rpc.js";

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

describe("Task 7: eventsByAddress, eventsByChain, eventsByHeight", () => {
  const validAddr40 = "a".repeat(40);

  describe("eventsByAddress()", () => {
    it("iterates events for an address with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ id: "e1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(eventsByAddress(validAddr40, { retry: false }));

      expect(result).toEqual([{ id: "e1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-address");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
    });

    it("normalizes 0x-prefixed addresses", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(eventsByAddress(addr, { retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(eventsByAddress(validAddr40, { pageParams: { page: 2, per_page: 50 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      await expect(collect(eventsByAddress("invalid", { retry: false }))).rejects.toThrow();
    });
  });

  describe("eventsByChain()", () => {
    it("iterates events for a chain/committee ID with default pagination", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ id: "e1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(eventsByChain(1, { retry: false }));

      expect(result).toEqual([{ id: "e1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-chain");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(1);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(eventsByChain(1, { pageParams: { page: 3, per_page: 100 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(100);
    });

    it("throws on invalid chain ID", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [] })));

      await expect(collect(eventsByChain(-1, { retry: false }))).rejects.toThrow();
      await expect(collect(eventsByChain("invalid" as any, { retry: false }))).rejects.toThrow();
    });
  });

  describe("eventsByHeight()", () => {
    it("iterates events at a specific block height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ id: "e1" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(eventsByHeight(42, { retry: false }));

      expect(result).toEqual([{ id: "e1" }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/events-by-height");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(42);
    });

    it("queries latest committed height when height is 0", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(eventsByHeight(0, { retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(eventsByHeight(100, { pageParams: { page: 2, per_page: 50, desc: false }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
      expect(body.desc).toBe(false);
    });

    it("advances pages until a short page ends iteration", async () => {
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.pageNumber === 1) return json({ results: [{ id: "e1" }, { id: "e2" }] });
        return json({ results: [{ id: "e3" }] });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(eventsByHeight(100, { pageParams: { per_page: 2 }, retry: false }));

      expect(result).toEqual([{ id: "e1" }, { id: "e2" }, { id: "e3" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
