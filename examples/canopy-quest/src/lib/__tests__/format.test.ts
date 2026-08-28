import { describe, expect, it } from "vitest";
import { formatAmount, parseAmountToMicro, normalizeAddress, validateSend } from "../format";

const SELF = "a".repeat(40);
const OTHER = "b".repeat(40);

describe("amount parsing", () => {
  it("converts decimal input to base units", () => {
    expect(parseAmountToMicro("1", 6)).toEqual({ ok: true, micro: 1_000_000 });
    expect(parseAmountToMicro("0.25", 6)).toEqual({ ok: true, micro: 250_000 });
    expect(parseAmountToMicro(" 12.5 ", 6)).toEqual({ ok: true, micro: 12_500_000 });
  });

  it("rejects non-numeric, zero, and negative input", () => {
    for (const input of ["", "abc", "1.2.3", "-5", "0", "."]) {
      expect(parseAmountToMicro(input, 6).ok).toBe(false);
    }
  });

  it("rejects more precision than the chain can represent", () => {
    const result = parseAmountToMicro("0.1234567", 6);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/decimal places/);
  });

  it("rejects amounts beyond safe integer range", () => {
    expect(parseAmountToMicro("100000000000", 6).ok).toBe(false);
  });

  it("round-trips through the display formatter", () => {
    expect(formatAmount(1_500_000, 6)).toBe("1.5");
    expect(formatAmount(0, 6)).toBe("0");
  });
});

describe("send validation", () => {
  const base = { balanceMicro: 10_000_000, feeMicro: 10_000, selfAddress: SELF, exponent: 6 };

  it("accepts a well-formed transfer", () => {
    const result = validateSend({ ...base, recipient: OTHER, amount: "1" });
    expect(result.ok).toBe(true);
    expect(result.amountMicro).toBe(1_000_000);
    expect(result.totalMicro).toBe(1_010_000);
  });

  it("accepts a 0x-prefixed recipient by normalizing it", () => {
    expect(validateSend({ ...base, recipient: `0x${OTHER}`, amount: "1" }).ok).toBe(true);
    expect(normalizeAddress(`0X${OTHER.toUpperCase()}`)).toBe(OTHER);
  });

  it("rejects a malformed recipient", () => {
    const result = validateSend({ ...base, recipient: "not-an-address", amount: "1" });
    expect(result.ok).toBe(false);
    expect(result.errors.recipient).toMatch(/Invalid recipient/);
  });

  it("rejects an empty recipient", () => {
    expect(validateSend({ ...base, recipient: "  ", amount: "1" }).errors.recipient).toMatch(/Enter a recipient/);
  });

  it("rejects sending to yourself", () => {
    const result = validateSend({ ...base, recipient: SELF.toUpperCase(), amount: "1" });
    expect(result.errors.recipient).toMatch(/your own address/);
  });

  it("rejects an amount that does not leave room for the fee", () => {
    const result = validateSend({ ...base, recipient: OTHER, amount: "10" });
    expect(result.ok).toBe(false);
    expect(result.errors.amount).toMatch(/Insufficient balance/);
  });

  it("allows spending the full balance minus the fee", () => {
    const result = validateSend({ ...base, recipient: OTHER, amount: "9.99" });
    expect(result.ok).toBe(true);
  });
});
