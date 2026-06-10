import { describe, it, expect } from "vitest";
import { generateKeyPair, encryptPrivateKeyHex } from "../wallet.js";
import { encryptKeyEntry, decryptEntry } from "../keystore.js";

describe("encrypt round-trip", () => {
  it("encryptPrivateKeyHex output decrypts back to the original key", async () => {
    const kp = generateKeyPair();
    const { encrypted, salt } = await encryptPrivateKeyHex(kp.privateKeyHex, "hunter2");
    // import decryptPrivateKeyHex lazily to prove symmetry with the existing path
    const { decryptPrivateKeyHex } = await import("../wallet.js");
    const back = await decryptPrivateKeyHex(encrypted, salt, "hunter2");
    expect(back).toBe(kp.privateKeyHex);
  });

  it("encryptKeyEntry produces a ParsedKeystoreEntry that decryptEntry opens", async () => {
    const kp = generateKeyPair();
    const entry = await encryptKeyEntry(
      {
        privateKeyHex: kp.privateKeyHex,
        publicKeyHex: kp.publicKeyHex,
        address: kp.address,
        curveType: kp.curveType,
        nickname: "test",
      },
      "pw",
    );
    expect(entry.address).toBe(kp.address);
    expect(entry.publicKey).toBe(kp.publicKeyHex);
    expect(entry.nickname).toBe("test");
    expect(await decryptEntry(entry, "pw")).toBe(kp.privateKeyHex);
  });

  it("wrong password fails to decrypt", async () => {
    const kp = generateKeyPair();
    const entry = await encryptKeyEntry(
      { privateKeyHex: kp.privateKeyHex, publicKeyHex: kp.publicKeyHex, address: kp.address, curveType: kp.curveType },
      "right",
    );
    await expect(decryptEntry(entry, "wrong")).rejects.toThrow();
  });
});
