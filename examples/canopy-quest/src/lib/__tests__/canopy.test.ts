import { describe, expect, it } from "vitest";
import { RpcError, TimeoutError, ResponseValidationError } from "@canopynetwork/canopy-ts/errors";
import { describeError, extractTxHash } from "../canopy";

describe("transaction hash extraction", () => {
  it("accepts the bare-string form the node returns", () => {
    expect(extractTxHash("ab".repeat(32))).toBe("ab".repeat(32));
  });

  it("accepts wrapped forms", () => {
    expect(extractTxHash({ txHash: "deadbeef" })).toBe("deadbeef");
    expect(extractTxHash({ hash: "deadbeef" })).toBe("deadbeef");
  });

  it("never invents a hash when the node returned none", () => {
    for (const value of [null, undefined, "", {}, { ok: true }, 42]) {
      expect(() => extractTxHash(value)).toThrow(/no transaction hash/i);
    }
  });
});

describe("error messages", () => {
  it("explains a timeout in user terms", () => {
    expect(describeError(new TimeoutError("timeout", { timeoutMs: 30_000 }))).toMatch(/did not respond/);
  });

  it("distinguishes an unreachable node from a rejected request", () => {
    expect(describeError(new RpcError("network"))).toMatch(/Unable to reach/);
    expect(describeError(new RpcError("bad request", { status: 400 }))).toMatch(/HTTP 400/);
    expect(describeError(new RpcError("boom", { status: 503 }))).toMatch(/server error/);
    expect(describeError(new RpcError("slow down", { status: 429 }))).toMatch(/rate limiting/);
  });

  it("reports a schema mismatch without leaking internals", () => {
    const message = describeError(new ResponseValidationError("bad", { value: { secret: 1 } }));
    expect(message).toMatch(/could not understand/);
    expect(message).not.toMatch(/secret/);
  });

  it("summarises total pool failure", () => {
    expect(describeError(new Error("All 2 RPC endpoints failed. Last error: x"))).toMatch(
      /every configured RPC endpoint failed/,
    );
  });

  it("falls back for unknown throwables", () => {
    expect(describeError({ weird: true }, "fallback text")).toBe("fallback text");
  });
});
