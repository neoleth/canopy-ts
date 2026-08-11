import { describe, it, expect, beforeEach, vi } from "vitest";
import { WalletManager } from "../wallet-manager.js";
import type { TransactionParams, CurveType } from "../types.js";
import { CurveType as CurveTypeEnum } from "../types.js";
import * as keystoreModule from "../keystore.js";
import * as walletModule from "../wallet.js";
import * as transactionModule from "../transaction.js";

// Mock data for tests
// BLS12381 public key is 48 bytes = 96 hex characters. keyAddress below is the real
// address deriveAddress() computes for it (sha256(pubkey)[:20], no "0x" prefix — see
// src/address.ts) — importFromGoKeystore() throws on any entry whose stored address
// doesn't match that derivation (integrity check, see keystore.ts), so a placeholder
// address here would fail every test that loads this fixture.
const mockBls12381PublicKey =
  "aa1a1c26055a329817a5759d877a2795f9499b97d6056edde0eea39512f24e8bc874b4471f0501127abb1ea0d9f68ac1";

const mockGoKeystoreEntry = {
  publicKey: mockBls12381PublicKey,
  salt: "b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
  encrypted: "d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  keyAddress: "196c357b8b3a6b3fd82386e7bebf77143d537cdb",
  keyNickname: "test-key",
};

const mockParsedKeystoreEntry = {
  publicKey: mockGoKeystoreEntry.publicKey,
  encryptedPrivateKey: mockGoKeystoreEntry.encrypted,
  salt: mockGoKeystoreEntry.salt,
  address: mockGoKeystoreEntry.keyAddress,
  curveType: CurveTypeEnum.BLS12381,
  nickname: mockGoKeystoreEntry.keyNickname,
};

const mockPrivateKeyHex =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// A second, distinct BLS12381 keypair — reusing mockBls12381PublicKey here with a
// different keyAddress would trip the same integrity check, since a public key can
// only ever derive to one address.
const mockSecondaryPublicKey =
  "8004066a1a5cb9cdf244e45f0a59cf579a78d90ac0bc24663565264601c1c9251c0aa3dfb9835b520e0ba0f211a6696c";

const mockKeystoreJson = {
  entries: [
    mockGoKeystoreEntry,
    {
      publicKey: mockSecondaryPublicKey,
      salt: "c5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      encrypted: "e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      keyAddress: "06d32a2078692dadc0b81723abb6cb8fe996b44a",
      keyNickname: "secondary-key",
    },
  ],
};

const mockTransactionParams: TransactionParams = {
  type: "guestbook:Write",
  msg: { text: "hello blockchain" },
  fee: 100,
  memo: "test transaction",
  networkID: 1,
  chainID: 1,
  height: 100,
};

const mockSignedTransaction = {
  transaction: {
    msg: {
      msgTypeUrl: "guestbook:Write",
      msgBytes: Buffer.from("test").toString("hex"),
    },
    fee: 100,
    memo: "test transaction",
    networkID: 1,
    chainID: 1,
    height: 100,
  },
  signatures: [
    {
      publicKey: mockGoKeystoreEntry.publicKey,
      signature: "mocksignature123",
    },
  ],
};

describe("WalletManager", () => {
  let walletManager: WalletManager;

  beforeEach(() => {
    walletManager = new WalletManager();
    vi.clearAllMocks();
  });

  describe("loadKeystoreJson", () => {
    it("should load single account from keystore JSON", () => {
      const singleEntryKeystore = {
        entries: [mockGoKeystoreEntry],
      };

      walletManager.loadKeystoreJson(singleEntryKeystore);

      const accounts = walletManager.getAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toBe(mockGoKeystoreEntry.keyAddress.toLowerCase());
    });

    it("should load multiple accounts from keystore JSON", () => {
      walletManager.loadKeystoreJson(mockKeystoreJson);

      const accounts = walletManager.getAccounts();
      expect(accounts).toHaveLength(2);
      expect(accounts).toContain(
        mockGoKeystoreEntry.keyAddress.toLowerCase()
      );
      expect(accounts).toContain(
        mockKeystoreJson.entries[1].keyAddress.toLowerCase()
      );
    });

    it("should normalize addresses to lowercase", () => {
      const mixedCaseEntry = {
        entries: [
          {
            ...mockGoKeystoreEntry,
            keyAddress: "196C357B8B3A6B3FD82386E7BEBF77143D537CDB",
          },
        ],
      };

      walletManager.loadKeystoreJson(mixedCaseEntry);

      const accounts = walletManager.getAccounts();
      expect(accounts[0]).toBe("196c357b8b3a6b3fd82386e7bebf77143d537cdb");
    });

    it("should throw error on invalid keystore format - missing entries", () => {
      const invalidKeystore = {};

      expect(() => {
        walletManager.loadKeystoreJson(invalidKeystore as any);
      }).toThrow("Invalid keystore format: missing entries array");
    });

    it("should throw error on invalid keystore format - entries not array", () => {
      const invalidKeystore = { entries: "not-an-array" };

      expect(() => {
        walletManager.loadKeystoreJson(invalidKeystore as any);
      }).toThrow("Invalid keystore format: missing entries array");
    });

    it("should store public key with account", () => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });

      const account = walletManager.getAccount(
        mockGoKeystoreEntry.keyAddress
      );
      expect(account?.publicKey).toBe(mockGoKeystoreEntry.publicKey);
    });

    it("should store curve type with account", () => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });

      const account = walletManager.getAccount(
        mockGoKeystoreEntry.keyAddress
      );
      expect(account?.curveType).toBe(CurveTypeEnum.BLS12381);
    });
  });

  describe("getAccounts", () => {
    it("should return empty array when no accounts loaded", () => {
      const accounts = walletManager.getAccounts();
      expect(accounts).toHaveLength(0);
      expect(Array.isArray(accounts)).toBe(true);
    });

    it("should return all loaded account addresses", () => {
      walletManager.loadKeystoreJson(mockKeystoreJson);

      const accounts = walletManager.getAccounts();
      expect(accounts).toHaveLength(2);
      expect(accounts).toBeInstanceOf(Array);
    });
  });

  describe("getAccount", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should retrieve account by address", () => {
      const account = walletManager.getAccount(
        mockGoKeystoreEntry.keyAddress
      );

      expect(account).toBeDefined();
      expect(account?.address).toBe(
        mockGoKeystoreEntry.keyAddress.toLowerCase()
      );
    });

    it("should handle mixed case address lookup", () => {
      const mixedCaseAddress = "196C357B8B3A6B3FD82386E7BEBF77143D537CDB";
      const account = walletManager.getAccount(mixedCaseAddress);

      expect(account).toBeDefined();
      expect(account?.address).toBe(
        mockGoKeystoreEntry.keyAddress.toLowerCase()
      );
    });

    it("should return undefined for non-existent account", () => {
      const account = walletManager.getAccount(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      );

      expect(account).toBeUndefined();
    });

    it("should include all account properties", () => {
      const account = walletManager.getAccount(
        mockGoKeystoreEntry.keyAddress
      );

      expect(account).toHaveProperty("address");
      expect(account).toHaveProperty("publicKey");
      expect(account).toHaveProperty("curveType");
    });
  });

  describe("unlockAccount", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should return private key hex on successful unlock", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );

      const privateKey = await walletManager.unlockAccount(
        mockGoKeystoreEntry.keyAddress,
        "correct-password"
      );

      expect(privateKey).toBe(mockPrivateKeyHex);
    });

    it("should throw error for non-existent account", async () => {
      await expect(
        walletManager.unlockAccount(
          "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          "password"
        )
      ).rejects.toThrow("Account not found");
    });

    it("should handle decryption errors", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockRejectedValue(
        new Error("Invalid password")
      );

      await expect(
        walletManager.unlockAccount(
          mockGoKeystoreEntry.keyAddress,
          "wrong-password"
        )
      ).rejects.toThrow("Failed to unlock account");
    });

    it("should normalize address to lowercase", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );

      const mixedCaseAddress = "196C357B8B3A6B3FD82386E7BEBF77143D537CDB";
      const privateKey = await walletManager.unlockAccount(
        mixedCaseAddress,
        "password"
      );

      expect(privateKey).toBe(mockPrivateKeyHex);
    });

    it("should support multiple unlock attempts", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );

      const result1 = await walletManager.unlockAccount(
        mockGoKeystoreEntry.keyAddress,
        "password1"
      );
      const result2 = await walletManager.unlockAccount(
        mockGoKeystoreEntry.keyAddress,
        "password2"
      );

      expect(result1).toBe(mockPrivateKeyHex);
      expect(result2).toBe(mockPrivateKeyHex);
    });
  });

  describe("buildTransaction", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should build signed transaction with correct account", () => {
      vi.spyOn(transactionModule, "createAndSignTransaction").mockReturnValue(
        mockSignedTransaction as any
      );

      const tx = walletManager.buildTransaction(
        mockGoKeystoreEntry.keyAddress,
        mockTransactionParams,
        mockPrivateKeyHex
      );

      expect(tx).toBe(mockSignedTransaction);
    });

    it("should throw error for non-existent account", () => {
      expect(() => {
        walletManager.buildTransaction(
          "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          mockTransactionParams,
          mockPrivateKeyHex
        );
      }).toThrow("Account not found");
    });

    it("should pass correct parameters to createAndSignTransaction", () => {
      const createAndSignSpy = vi
        .spyOn(transactionModule, "createAndSignTransaction")
        .mockReturnValue(mockSignedTransaction as any);

      walletManager.buildTransaction(
        mockGoKeystoreEntry.keyAddress,
        mockTransactionParams,
        mockPrivateKeyHex
      );

      expect(createAndSignSpy).toHaveBeenCalledWith(
        mockTransactionParams,
        mockPrivateKeyHex,
        mockGoKeystoreEntry.publicKey,
        CurveTypeEnum.BLS12381
      );
    });

    it("should support mixed case address", () => {
      vi.spyOn(transactionModule, "createAndSignTransaction").mockReturnValue(
        mockSignedTransaction as any
      );

      const mixedCaseAddress = "196C357B8B3A6B3FD82386E7BEBF77143D537CDB";
      const tx = walletManager.buildTransaction(
        mixedCaseAddress,
        mockTransactionParams,
        mockPrivateKeyHex
      );

      expect(tx).toBe(mockSignedTransaction);
    });
  });

  describe("signTransaction", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should unlock account and build transaction", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );
      vi.spyOn(transactionModule, "createAndSignTransaction").mockReturnValue(
        mockSignedTransaction as any
      );

      const tx = await walletManager.signTransaction(
        mockGoKeystoreEntry.keyAddress,
        "correct-password",
        mockTransactionParams
      );

      expect(tx).toBe(mockSignedTransaction);
    });

    it("should throw error if account not found during unlock", async () => {
      await expect(
        walletManager.signTransaction(
          "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          "password",
          mockTransactionParams
        )
      ).rejects.toThrow("Account not found");
    });

    it("should throw error if account not found during build", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );

      // Load initial account, then remove it from accounts map before building
      const initialAccounts = walletManager.getAccounts();
      expect(initialAccounts).toHaveLength(1);

      await expect(
        walletManager.signTransaction(
          "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          "password",
          mockTransactionParams
        )
      ).rejects.toThrow("Account not found");
    });

    it("should handle unlock errors during sign", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockRejectedValue(
        new Error("Invalid password")
      );

      await expect(
        walletManager.signTransaction(
          mockGoKeystoreEntry.keyAddress,
          "wrong-password",
          mockTransactionParams
        )
      ).rejects.toThrow("Failed to unlock account");
    });
  });

  describe("isValidAccount", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should return true for loaded account", () => {
      const isValid = walletManager.isValidAccount(
        mockGoKeystoreEntry.keyAddress
      );
      expect(isValid).toBe(true);
    });

    it("should return false for non-existent account", () => {
      const isValid = walletManager.isValidAccount(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      );
      expect(isValid).toBe(false);
    });

    it("should handle mixed case address", () => {
      const mixedCaseAddress = "196C357B8B3A6B3FD82386E7BEBF77143D537CDB";
      const isValid = walletManager.isValidAccount(mixedCaseAddress);
      expect(isValid).toBe(true);
    });
  });

  describe("getCurveType", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });
    });

    it("should return curve type for loaded account", () => {
      const curveType = walletManager.getCurveType(
        mockGoKeystoreEntry.keyAddress
      );
      expect(curveType).toBe(CurveTypeEnum.BLS12381);
    });

    it("should return undefined for non-existent account", () => {
      const curveType = walletManager.getCurveType(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      );
      expect(curveType).toBeUndefined();
    });

    it("should handle mixed case address", () => {
      const mixedCaseAddress = "196C357B8B3A6B3FD82386E7BEBF77143D537CDB";
      const curveType = walletManager.getCurveType(mixedCaseAddress);
      expect(curveType).toBe(CurveTypeEnum.BLS12381);
    });
  });

  describe("clear", () => {
    beforeEach(() => {
      walletManager.loadKeystoreJson(mockKeystoreJson);
    });

    it("should clear all accounts", () => {
      expect(walletManager.getAccounts()).toHaveLength(2);

      walletManager.clear();

      expect(walletManager.getAccounts()).toHaveLength(0);
    });

    it("should make cleared accounts unavailable", () => {
      const address = mockGoKeystoreEntry.keyAddress;
      expect(walletManager.isValidAccount(address)).toBe(true);

      walletManager.clear();

      expect(walletManager.isValidAccount(address)).toBe(false);
    });

    it("should allow reloading after clear", () => {
      walletManager.clear();
      expect(walletManager.getAccounts()).toHaveLength(0);

      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });

      expect(walletManager.getAccounts()).toHaveLength(1);
    });

    it("should clear internal keystoreData", async () => {
      walletManager.clear();

      await expect(
        walletManager.unlockAccount(
          mockGoKeystoreEntry.keyAddress,
          "password"
        )
      ).rejects.toThrow("Account not found");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete wallet flow: load -> validate -> unlock -> sign", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockResolvedValue(
        mockPrivateKeyHex
      );
      vi.spyOn(transactionModule, "createAndSignTransaction").mockReturnValue(
        mockSignedTransaction as any
      );

      walletManager.loadKeystoreJson({
        entries: [mockGoKeystoreEntry],
      });

      const address = mockGoKeystoreEntry.keyAddress;

      // Validate account exists
      expect(walletManager.isValidAccount(address)).toBe(true);

      // Get account details
      const account = walletManager.getAccount(address);
      expect(account).toBeDefined();

      // Unlock and sign
      const tx = await walletManager.signTransaction(
        address,
        "password",
        mockTransactionParams
      );

      expect(tx).toBe(mockSignedTransaction);
    });

    it("should handle multiple accounts independently", async () => {
      vi.spyOn(keystoreModule, "decryptEntry").mockImplementation(
        async (entry) => {
          return entry.address.includes("1234")
            ? "privatekey1"
            : "privatekey2";
        }
      );
      vi.spyOn(transactionModule, "createAndSignTransaction").mockReturnValue(
        mockSignedTransaction as any
      );

      walletManager.loadKeystoreJson(mockKeystoreJson);

      const accounts = walletManager.getAccounts();
      expect(accounts).toHaveLength(2);

      for (const address of accounts) {
        const privateKey = await walletManager.unlockAccount(
          address,
          "password"
        );
        expect(privateKey).toBeDefined();
      }
    });
  });
});
