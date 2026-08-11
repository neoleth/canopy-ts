import { describe, it, expect, vi, afterEach } from "vitest";
import { supply, params, fees } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 9: supply, params, fees", () => {
  describe("supply()", () => {
    it("queries token supply information at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ total: 10000000, burned: 100000 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await supply({ retry: false });

      expect(result.total).toBe(10000000);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/supply");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ total: 10000000 }));
      vi.stubGlobal("fetch", fetchMock);

      await supply({ height: 100, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(100);
    });
  });

  describe("params()", () => {
    it("queries network governance parameters at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ feeParams: {}, govParams: {}, consensusParams: {} })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await params({ retry: false });

      expect(result.feeParams).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/params");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ feeParams: {} }));
      vi.stubGlobal("fetch", fetchMock);

      await params({ height: 200, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(200);
    });
  });

  describe("fees()", () => {
    it("queries current network fee parameters at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ minFee: 1000, baseFee: 500 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await fees({ retry: false });

      expect(result.minFee).toBe(1000);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/fee-params");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ minFee: 1000 }));
      vi.stubGlobal("fetch", fetchMock);

      await fees({ height: 300, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(300);
    });
  });
});
