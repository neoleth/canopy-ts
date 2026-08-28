/**
 * Wallet operations, built on the SDK's `WalletManager` + keystore helpers.
 *
 * Security rules this module enforces:
 *  - private keys are only ever persisted encrypted (SDK `encryptKeyEntry`,
 *    argon2i + AES-GCM), never in plaintext;
 *  - a decrypted key exists only in the returned session object, held in React
 *    memory for the life of the tab;
 *  - nothing here logs a private key, and no key is ever sent to a server —
 *    signing happens locally and only the signed transaction is broadcast.
 */
import { WalletManager } from "@canopynetwork/canopy-ts/wallet-manager";
import {
  encryptKeyEntry,
  importFromGoKeystore,
} from "@canopynetwork/canopy-ts/keystore";
import type { GoKeystoreEntry, ParsedKeystoreEntry } from "@canopynetwork/canopy-ts/keystore";
import {
  CurveType,
  deriveAddress,
  derivePublicKey,
  detectPublicKeyCurve,
} from "@canopynetwork/canopy-ts/crypto";
import { localKeystoreStorage } from "./storage";
import type { WalletSession, WalletSummary } from "../types/wallet";

let manager: WalletManager | null = null;

/** The app's single `WalletManager`, wired to the localStorage keystore. */
export function walletManager(): WalletManager {
  if (!manager) {
    manager = new WalletManager({ storage: localKeystoreStorage });
    hydrate(manager);
  }
  return manager;
}

/**
 * Load stored entries into the manager's cache. `loadAccounts()` is not used
 * here: it fetches the node's *admin* keystore, which a browser dApp neither
 * reaches nor should — these wallets are local-only.
 */
function hydrate(wm: WalletManager): void {
  for (const entry of localKeystoreStorage.load()) {
    wm.importEntry(entry);
  }
}

export function listWallets(): WalletSummary[] {
  return walletManager().listAccounts();
}

function summaryFor(address: string): WalletSummary | undefined {
  return listWallets().find((w) => w.address.toLowerCase() === address.toLowerCase());
}

export interface CreateWalletResult {
  session: WalletSession;
  /** The encrypted keystore entry, offered to the user as a one-time backup. */
  backup: ParsedKeystoreEntry;
}

/**
 * Create a brand new ed25519 wallet. The SDK generates the key with a CSPRNG,
 * encrypts it under `password`, and persists only the ciphertext.
 */
export async function createWallet(
  nickname: string,
  password: string,
): Promise<CreateWalletResult> {
  const wm = walletManager();
  const unlocked = await wm.createWallet(nickname.trim() || "Canopy Quest wallet", password);
  const backup = await wm.exportEncryptedEntry(unlocked.address, password, password);
  return {
    session: { ...unlocked, nickname: nickname.trim() || undefined },
    backup,
  };
}

export async function unlockWallet(address: string, password: string): Promise<WalletSession> {
  const wm = walletManager();
  const unlocked = await wm.unlock(address, password);
  return { ...unlocked, nickname: summaryFor(address)?.nickname };
}

export interface ImportPrivateKeyArgs {
  privateKeyHex: string;
  password: string;
  nickname?: string;
  curveType?: CurveType;
}

/**
 * Import an existing key. The key is encrypted immediately and only the
 * ciphertext is stored; the plaintext lives on solely in the returned session.
 */
export async function importPrivateKey(args: ImportPrivateKeyArgs): Promise<WalletSession> {
  const privateKeyHex = args.privateKeyHex.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) {
    throw new Error("Private key must be 64 hexadecimal characters.");
  }
  const curveType = args.curveType ?? CurveType.ED25519;
  const publicKeyHex = derivePublicKey(privateKeyHex, curveType);
  const address = deriveAddress(publicKeyHex, curveType);

  const entry = await encryptKeyEntry(
    { privateKeyHex, publicKeyHex, address, curveType, nickname: args.nickname?.trim() || undefined },
    args.password,
  );
  walletManager().importEntry(entry);

  return { address, publicKeyHex, privateKeyHex, curveType, nickname: args.nickname?.trim() || undefined };
}

/**
 * Import a Go-keystore entry (the format a Canopy node's keystore uses, and
 * the format this app exports). Stays encrypted: the user unlocks it after.
 */
export function importKeystoreEntry(json: string): WalletSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That is not valid JSON.");
  }
  const entry = parsed as Partial<GoKeystoreEntry> & Partial<ParsedKeystoreEntry>;

  // Accept both the Go keystore shape and this app's own export shape.
  if (entry.publicKey && entry.salt && (entry.encrypted || entry.encryptedPrivateKey)) {
    const keyAddress =
      entry.keyAddress ?? entry.address ?? deriveAddress(entry.publicKey, detectPublicKeyCurve(entry.publicKey));
    const imported = importFromGoKeystore({
      publicKey: entry.publicKey,
      salt: entry.salt,
      encrypted: (entry.encrypted ?? entry.encryptedPrivateKey) as string,
      keyAddress,
      keyNickname: entry.keyNickname ?? entry.nickname,
    });
    walletManager().importEntry(imported);
    return {
      address: imported.address.toLowerCase(),
      publicKey: imported.publicKey,
      curveType: imported.curveType,
      nickname: imported.nickname,
    };
  }
  throw new Error("Missing keystore fields — expected publicKey, salt, and encrypted.");
}

/**
 * Re-encrypt a stored wallet under an export password and return it. No
 * plaintext key crosses this boundary — the SDK decrypts and re-encrypts
 * in-process.
 */
export async function exportKeystoreEntry(
  address: string,
  currentPassword: string,
  exportPassword: string,
): Promise<ParsedKeystoreEntry> {
  return walletManager().exportEncryptedEntry(address, currentPassword, exportPassword);
}

export function deleteWallet(address: string): void {
  walletManager().deleteAccount(address);
}

/** Human-readable curve label for the UI. */
export function curveLabel(curveType: CurveType): string {
  switch (curveType) {
    case CurveType.ED25519:
      return "Ed25519";
    case CurveType.BLS12381:
      return "BLS12-381";
    case CurveType.SECP256K1:
      return "secp256k1";
    case CurveType.ETHSECP256K1:
      return "eth-secp256k1";
    default:
      return String(curveType);
  }
}

export { CurveType };
