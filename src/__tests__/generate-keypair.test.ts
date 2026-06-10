import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../wallet.js";
import { deriveAddress } from "../address.js";
import { derivePublicKey } from "../signing.js";
import { CurveType } from "../types.js";

describe("generateKeyPair", () => {
  it("produces a 32-byte ed25519 private key with a matching public key and address", () => {
    const kp = generateKeyPair();
    expect(kp.curveType).toBe(CurveType.ED25519);
    expect(kp.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    // public key derived independently must match
    expect(derivePublicKey(kp.privateKeyHex, CurveType.ED25519)).toBe(
      kp.publicKeyHex
    );
    // address derived independently must match
    expect(deriveAddress(kp.publicKeyHex, CurveType.ED25519)).toBe(
      kp.address
    );
  });

  it("produces a different key each call", () => {
    expect(generateKeyPair().privateKeyHex).not.toBe(
      generateKeyPair().privateKeyHex
    );
  });
});
