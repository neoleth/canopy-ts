import { describe, it, expect } from "vitest";
import { createAndSignTransaction } from "../transaction.js";
import { derivePublicKey } from "../signing.js";
import { CurveType } from "../types.js";
import { bytesToBase64 } from "../base64.js";
import { hexToBytes } from "@noble/hashes/utils.js";

// Fixed BLS12381 private key (well within the scalar field's valid range) so signing
// is deterministic — generateKeyPair() draws random bytes and can occasionally produce
// a scalar bls12_381 rejects as "out of range", which is unrelated to what these tests
// exercise (transaction output shape, not signature validity).
const PRIVATE_KEY_HEX = "01".repeat(32);
const PUBLIC_KEY_HEX = derivePublicKey(PRIVATE_KEY_HEX, CurveType.BLS12381);

// The node's lib.Transaction.UnmarshalJSON only honors msgTypeUrl/msgBytes for
// plugin-defined message types. For registered core types (send, stake, ...) it
// requires the protojson `msg` field instead: base64-encoded bytes fields,
// camelCase names. See TASKS.md.
describe("createAndSignTransaction core format", () => {
  it("emits a protojson msg field instead of msgTypeUrl/msgBytes for a registered core type", () => {
    const fromAddress = "aa".repeat(20);
    const toAddress = "bb".repeat(20);

    const tx = createAndSignTransaction(
      {
        type: "send",
        msg: { fromAddress, toAddress, amount: 100 },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      fromAddress: bytesToBase64(hexToBytes(fromAddress)),
      toAddress: bytesToBase64(hexToBytes(toAddress)),
      amount: 100,
    });
    expect(tx).not.toHaveProperty("msgTypeUrl");
    expect(tx).not.toHaveProperty("msgBytes");
  });

  it("still returns the msgTypeUrl/msgBytes plugin format by default", () => {
    const tx = createAndSignTransaction(
      {
        type: "send",
        msg: { fromAddress: "aa".repeat(20), toAddress: "bb".repeat(20), amount: 100 },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX
    ) as any;

    expect(tx.msgTypeUrl).toBe("type.googleapis.com/types.MessageSend");
    expect(typeof tx.msgBytes).toBe("string");
    expect(tx).not.toHaveProperty("msg");
  });
});
