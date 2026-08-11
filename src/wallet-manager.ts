import { bytesToHex } from "@noble/hashes/utils.js";
import { deriveAddress } from "./address.js";
import { decryptEntry, importFromGoKeystore, encryptKeyEntry } from "./keystore.js";
import { detectPublicKeyCurve } from "./curve-detection.js";
import { createAndSignTransaction } from "./transaction.js";
import { fetchKeystore } from "./rpc.js";
import { generateKeyPair } from "./wallet.js";
import type {
  CurveType,
  TransactionParams,
  WalletAccount,
  UnlockedAccount,
  LoadedAccount,
} from "./types.js";
import type { PluginTransaction } from "./transaction.js";
import type { GoKeystoreEntry, ParsedKeystoreEntry, KeystoreStorage } from "./keystore.js";
import type { RequestOptions } from "./http.js";

/**
 * WalletManager — high-level wallet operations for Canopy blockchain transactions
 *
 * Handles:
 * - Account loading from Go keystore JSON
 * - Encrypted private key decryption with password
 * - Transaction building and signing
 * - Address derivation and validation
 */
export class WalletManager {
  private accounts: Map<string, WalletAccount> = new Map();
  private keystoreData: Map<string, ParsedKeystoreEntry> = new Map();
  private storage?: KeystoreStorage;

  constructor(opts: { storage?: KeystoreStorage } = {}) {
    this.storage = opts.storage;
  }

  /** Cache a parsed entry into the account registry (node or local). */
  private cacheEntry(entry: ParsedKeystoreEntry): void {
    const address = entry.address.toLowerCase();
    this.keystoreData.set(address, entry);
    this.accounts.set(address, {
      address,
      publicKey: entry.publicKey,
      curveType: entry.curveType,
    });
  }

  /**
   * Standalone: fetch the node keystore and merge any locally-created wallets
   * from the injected storage. Returns a secrets-free list for the login UI.
   */
  async loadAccounts(opts: RequestOptions = {}): Promise<LoadedAccount[]> {
    const nodeEntries = await fetchKeystore(opts);
    this.accounts.clear();
    this.keystoreData.clear();
    for (const entry of nodeEntries) this.cacheEntry(entry);
    for (const entry of this.storage?.load() ?? []) this.cacheEntry(entry);
    return Array.from(this.keystoreData.values()).map((e) => ({
      address: e.address,
      nickname: e.nickname || e.address.slice(0, 8),
    }));
  }

  /**
   * Standalone: generate a new ed25519 wallet, encrypt it with `password`, save
   * it to storage, cache it, and return the unlocked signer identity.
   */
  async createWallet(nickname: string, password: string): Promise<UnlockedAccount> {
    if (!this.storage)
      throw new Error("WalletManager: no storage configured for createWallet");
    const kp = generateKeyPair();
    const entry = await encryptKeyEntry(
      {
        privateKeyHex: kp.privateKeyHex,
        publicKeyHex: kp.publicKeyHex,
        address: kp.address,
        curveType: kp.curveType,
        nickname,
      },
      password,
    );
    this.storage.save(entry);
    this.cacheEntry(entry);
    return {
      address: kp.address,
      publicKeyHex: kp.publicKeyHex,
      privateKeyHex: kp.privateKeyHex,
      curveType: kp.curveType,
    };
  }

  /**
   * Standalone: import a pre-built encrypted entry (e.g. from a keystore JSON
   * paste) into storage + cache.
   */
  importEntry(entry: ParsedKeystoreEntry): void {
    if (this.storage) this.storage.save(entry);
    this.cacheEntry(entry);
  }

  /** Decrypt a cached entry and return the full signer identity. */
  async unlock(address: string, password: string): Promise<UnlockedAccount> {
    const addr = address.toLowerCase();
    const entry = this.keystoreData.get(addr);
    if (!entry) throw new Error(`Account not found: ${address}`);
    const privateKeyHex = await decryptEntry(entry, password);
    return {
      address: entry.address,
      publicKeyHex: entry.publicKey,
      privateKeyHex,
      curveType: entry.curveType,
    };
  }

  /**
   * Load wallet accounts from Go keystore JSON format
   * @param keystoreJson - Raw keystore JSON object with entries array
   */
  loadKeystoreJson(keystoreJson: { entries: GoKeystoreEntry[] }): void {
    if (!keystoreJson.entries || !Array.isArray(keystoreJson.entries)) {
      throw new Error("Invalid keystore format: missing entries array");
    }

    keystoreJson.entries.forEach((entry) => {
      const parsed = importFromGoKeystore(entry);
      const address = entry.keyAddress.toLowerCase();

      this.keystoreData.set(address, parsed);
      this.accounts.set(address, {
        address,
        publicKey: parsed.publicKey,
        curveType: parsed.curveType,
      });
    });
  }

  /**
   * Get list of available account addresses
   */
  getAccounts(): string[] {
    return Array.from(this.accounts.keys());
  }

  /**
   * Get account details by address
   */
  getAccount(address: string): WalletAccount | undefined {
    return this.accounts.get(address.toLowerCase());
  }

  /**
   * Decrypt and unlock an account's private key
   * @param address - Account address
   * @param password - Wallet password
   * @returns Hex-encoded private key
   */
  async unlockAccount(address: string, password: string): Promise<string> {
    const addr = address.toLowerCase();
    const keystoreEntry = this.keystoreData.get(addr);

    if (!keystoreEntry) {
      throw new Error(`Account not found: ${address}`);
    }

    try {
      const privateKeyHex = await decryptEntry(keystoreEntry, password);
      return privateKeyHex;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to unlock account ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Build and sign a transaction for an account
   * @param address - Account address to sign with
   * @param params - Transaction parameters
   * @param privateKeyHex - Hex-encoded private key (from unlockAccount)
   * @returns Signed PluginTransaction ready for /v1/tx submission
   */
  buildTransaction(
    address: string,
    params: TransactionParams,
    privateKeyHex: string
  ): PluginTransaction {
    const addr = address.toLowerCase();
    const account = this.accounts.get(addr);

    if (!account) {
      throw new Error(`Account not found: ${address}`);
    }

    return createAndSignTransaction(
      params,
      privateKeyHex,
      account.publicKey,
      account.curveType
    );
  }

  /**
   * All-in-one: unlock account and build signed transaction
   * Combines unlockAccount + buildTransaction
   * @param address - Account address
   * @param password - Wallet password
   * @param params - Transaction parameters
   * @returns Signed PluginTransaction
   */
  async signTransaction(
    address: string,
    password: string,
    params: TransactionParams
  ): Promise<PluginTransaction> {
    const privateKeyHex = await this.unlockAccount(address, password);
    return this.buildTransaction(address, params, privateKeyHex);
  }

  /**
   * Validate address format and check if account exists
   */
  isValidAccount(address: string): boolean {
    return this.accounts.has(address.toLowerCase());
  }

  /**
   * Get account's curve type
   */
  getCurveType(address: string): CurveType | undefined {
    const account = this.accounts.get(address.toLowerCase());
    return account?.curveType;
  }

  /**
   * Clear all loaded accounts (secure cleanup)
   */
  clear(): void {
    this.accounts.clear();
    this.keystoreData.clear();
  }

  /**
   * Remove a single account from storage and the in-memory cache.
   * @param address - Account address to delete
   * @throws if the address isn't currently loaded
   */
  deleteAccount(address: string): void {
    const addr = address.toLowerCase();
    if (!this.accounts.has(addr)) {
      throw new Error(`Account not found: ${address}`);
    }
    this.storage?.remove(addr);
    this.accounts.delete(addr);
    this.keystoreData.delete(addr);
  }
}
