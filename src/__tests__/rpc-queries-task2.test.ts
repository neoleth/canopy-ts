import { describe, it, expect, vi, afterEach } from "vitest";
import { account, blockByHeight, blockByHash } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 2: account, blockByHeight, blockByHash", () => {
  const validAddr40 = "a".repeat(40);
  const validAddr42 = "0x" + "a".repeat(40);

  describe("account()", () => {
    it("queries account by address at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ address: validAddr40, balance: 1000, staked: 500 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await account(validAddr40, { retry: false });

      expect(result.address).toBe(validAddr40);
      expect(result.balance).toBe(1000);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/account");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("normalizes 0x-prefixed addresses to lowercase", async () => {
      const addr = "0x" + "A".repeat(40);
      const fetchMock = vi.fn().mockResolvedValue(json({ address: validAddr40 }));
      vi.stubGlobal("fetch", fetchMock);

      await account(addr, { retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.address).toBe("a".repeat(40));
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ address: validAddr40 }));
      vi.stubGlobal("fetch", fetchMock);

      await account(validAddr40, { height: 42, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(42);
    });

    it("throws on invalid address", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ address: "abc" })));

      expect(account("invalid", { retry: false })).rejects.toThrow();
      expect(account("0xinvalid", { retry: false })).rejects.toThrow();
    });
  });

  describe("blockByHeight()", () => {
    it("queries block by height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ height: 42, hash: "abc123", data: {} })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await blockByHeight(42, { retry: false });

      expect(result.height).toBe(42);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/block-by-height");
    });

    it("throws on height 0", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ height: 0 })));

      expect(() => blockByHeight(0, { retry: false })).rejects.toThrow();
    });

    it("throws on negative height", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ height: -1 })));

      expect(() => blockByHeight(-1, { retry: false })).rejects.toThrow();
    });
  });

  describe("blockByHash()", () => {
    it("queries block by 64-char hex hash", async () => {
      const hash = "a".repeat(64);
      const fetchMock = vi.fn().mockResolvedValue(
        json({ hash, height: 100, data: {} })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await blockByHash(hash, { retry: false });

      expect(result.hash).toBe(hash);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/block-by-hash");
    });

    it("throws on invalid hash length", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ hash: "invalid" })));

      expect(() => blockByHash("abc", { retry: false })).rejects.toThrow();
      expect(() => blockByHash("a".repeat(63), { retry: false })).rejects.toThrow();
      expect(() => blockByHash("a".repeat(65), { retry: false })).rejects.toThrow();
    });
  });
});
