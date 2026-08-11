import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletManager } from "../wallet-manager.js";
import { encryptKeyEntry } from "../keystore.js";
import { generateKeyPair } from "../wallet.js";
import type { KeystoreStorage, ParsedKeystoreEntry } from "../keystore.js";

// fetchKeystore is the network source; mock it.
vi.mock("../rpc.js", () => ({ fetchKeystore: vi.fn() }));
import { fetchKeystore } from "../rpc.js";

function fakeStorage(): KeystoreStorage {
  let entries: ParsedKeystoreEntry[] = [];
  return {
    load: () => entries.slice(),
    save: (e) => {
      entries = entries.filter((x) => x.address !== e.address).concat(e);
    },
    remove: (addr) => {
      entries = entries.filter((x) => x.address.toLowerCase() !== addr.toLowerCase());
    },
  };
}

describe("WalletManager standalone", () => {
  beforeEach(() => vi.mocked(fetchKeystore).mockReset());

  it("loadAccounts merges node keystore + local storage", async () => {
    const kp = generateKeyPair();
    const localEntry = await encryptKeyEntry(
      {
        privateKeyHex: kp.privateKeyHex,
        publicKeyHex: kp.publicKeyHex,
        address: kp.address,
        curveType: kp.curveType,
        nickname: "local-1",
      },
      "pw",
    );
    const storage = fakeStorage();
    storage.save(localEntry);
    vi.mocked(fetchKeystore).mockResolvedValue([
      {
        publicKey: "aa",
        encryptedPrivateKey: "bb",
        salt: "cc",
        address: "node00",
        curveType: "ed25519",
        nickname: "node-1",
      } as any,
    ]);

    const wm = new WalletManager({ storage });
    const accounts = await wm.loadAccounts();
    const addrs = accounts.map((a) => a.address.toLowerCase());
    expect(addrs).toContain("node00");
    expect(addrs).toContain(kp.address.toLowerCase());
  });

  it("createWallet persists and the new account unlocks", async () => {
    const storage = fakeStorage();
    const wm = new WalletManager({ storage });
    const acct = await wm.createWallet("mine", "secret");
    expect(storage.load().some((e) => e.address === acct.address)).toBe(true);
    const unlocked = await wm.unlock(acct.address, "secret");
    expect(unlocked.privateKeyHex).toBe(acct.privateKeyHex);
    expect(unlocked.publicKeyHex).toBe(acct.publicKeyHex);
  });

  it("createWallet without storage throws", async () => {
    const wm = new WalletManager();
    await expect(wm.createWallet("x", "y")).rejects.toThrow(/storage/i);
  });

  it("unlock with the wrong password rejects", async () => {
    const storage = fakeStorage();
    const wm = new WalletManager({ storage });
    const acct = await wm.createWallet("mine", "secret");
    await expect(wm.unlock(acct.address, "nope")).rejects.toThrow();
  });

  it("deleteAccount removes a single entry from storage and the in-memory cache", async () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const entry1 = await encryptKeyEntry(
      { privateKeyHex: kp1.privateKeyHex, publicKeyHex: kp1.publicKeyHex, address: kp1.address, curveType: kp1.curveType, nickname: "one" },
      "pw",
    );
    const entry2 = await encryptKeyEntry(
      { privateKeyHex: kp2.privateKeyHex, publicKeyHex: kp2.publicKeyHex, address: kp2.address, curveType: kp2.curveType, nickname: "two" },
      "pw",
    );
    const storage = fakeStorage();
    storage.save(entry1);
    storage.save(entry2);
    vi.mocked(fetchKeystore).mockResolvedValue([]);

    const wm = new WalletManager({ storage });
    await wm.loadAccounts();
    expect(wm.getAccounts()).toHaveLength(2);

    wm.deleteAccount(kp1.address);

    expect(wm.getAccounts()).toEqual([kp2.address.toLowerCase()]);
    expect(storage.load().map((e) => e.address)).toEqual([kp2.address]);
  });

  it("deleteAccount throws when the address isn't loaded", () => {
    const wm = new WalletManager({ storage: fakeStorage() });
    expect(() => wm.deleteAccount("aa".repeat(20))).toThrow(/Account not found/);
  });
});
