import { describe, it, expect, vi, afterEach } from "vitest";
import { validator, validators } from "../rpc.js";

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

describe("Task 8: validator, validators", () => {
  const validAddr40 = "a".repeat(40);

  describe("validator()", () => {
    it("queries validator information by address at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ address: validAddr40, stake: 1000000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await validator(validAddr40, { retry: false });

      expect(result.address).toBe(validAddr40);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/validator");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe(validAddr40);
      expect(body.height).toBe(0);
    });

    it("normalizes 0x-prefixed addresses", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ address: validAddr40 }));
      vi.stubGlobal("fetch", fetchMock);

      await validator(addr, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ address: validAddr40 }));
      vi.stubGlobal("fetch", fetchMock);

      await validator(validAddr40, { height: 100, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(100);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ address: validAddr40 })));

      expect(validator("invalid", { retry: false })).rejects.toThrow();
      expect(validator("0xinvalid", { retry: false })).rejects.toThrow();
    });
  });

  describe("validators()", () => {
    it("iterates the validators list with default pagination at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [{ address: validAddr40 }] }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(validators({ retry: false }));

      expect(result).toEqual([{ address: validAddr40 }]);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/validators");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(1);
      expect(body.height).toBe(0);
    });

    it("uses custom page params", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(validators({ pageParams: { page: 2, per_page: 50 }, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(2);
      expect(body.perPage).toBe(50);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(validators({ height: 150, retry: false }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(150);
    });

    it("combines page params and height in request", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await collect(validators({
        pageParams: { page: 3, per_page: 100, order_by: "stake", desc: true },
        height: 200,
        retry: false,
      }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.pageNumber).toBe(3);
      expect(body.perPage).toBe(100);
      expect(body.orderBy).toBe("stake");
      expect(body.desc).toBe(true);
      expect(body.height).toBe(200);
    });

    it("advances pages until a short page ends iteration", async () => {
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.pageNumber === 1) return json({ results: [{ address: "a1" }, { address: "a2" }] });
        return json({ results: [{ address: "a3" }] });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collect(validators({ pageParams: { per_page: 2 }, retry: false }));

      expect(result).toEqual([{ address: "a1" }, { address: "a2" }, { address: "a3" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
