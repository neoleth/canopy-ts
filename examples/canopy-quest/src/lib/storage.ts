/**
 * Local persistence.
 *
 * Two things are stored, both in localStorage:
 *  - keystore entries: PBKDF-encrypted private keys produced by the SDK
 *    (`encryptKeyEntry`). Never a plaintext key.
 *  - quest evidence: the record of which real SDK calls have succeeded.
 *
 * Every read is defensive — a corrupt or foreign value is discarded rather
 * than thrown, so a bad key can never brick the app.
 */
import type { ParsedKeystoreEntry, KeystoreStorage } from "@canopynetwork/canopy-ts/keystore";
import type { QuestEvidence } from "../types/quest";

const KEYSTORE_KEY = "canopy-quest:v1:keystore";
const EVIDENCE_PREFIX = "canopy-quest:v1:evidence:";
const PROFILE_KEY = "canopy-quest:v1:profile";

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Quota or a privacy-mode storage block. Non-fatal: the session keeps
    // working, it just won't survive a reload.
    console.warn("canopy-quest: failed to persist", key, e);
  }
}

function isKeystoreEntry(value: unknown): value is ParsedKeystoreEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.address === "string" &&
    typeof e.publicKey === "string" &&
    typeof e.encryptedPrivateKey === "string" &&
    typeof e.salt === "string" &&
    typeof e.curveType === "string"
  );
}

/**
 * `KeystoreStorage` implementation backed by localStorage — this is the
 * browser adapter the SDK expects callers to inject into `WalletManager`.
 */
export const localKeystoreStorage: KeystoreStorage = {
  load(): ParsedKeystoreEntry[] {
    const raw = readJSON<unknown>(KEYSTORE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isKeystoreEntry);
  },
  save(entry: ParsedKeystoreEntry): void {
    const entries = localKeystoreStorage.load().filter(
      (e) => e.address.toLowerCase() !== entry.address.toLowerCase(),
    );
    entries.push(entry);
    writeJSON(KEYSTORE_KEY, entries);
  },
  remove(address: string): void {
    const entries = localKeystoreStorage
      .load()
      .filter((e) => e.address.toLowerCase() !== address.toLowerCase());
    writeJSON(KEYSTORE_KEY, entries);
  },
};

export function emptyEvidence(): QuestEvidence {
  return {
    walletAddress: null,
    heightQueried: null,
    validatorsLoaded: null,
    eventsInspected: null,
    transactions: [],
    networkDaysUTC: [],
  };
}

/** Quest evidence is scoped per address so two wallets don't share progress. */
function evidenceKey(address: string | null): string {
  return EVIDENCE_PREFIX + (address ? address.toLowerCase() : "anonymous");
}

export function loadEvidence(address: string | null): QuestEvidence {
  const stored = readJSON<Partial<QuestEvidence>>(evidenceKey(address));
  const base = emptyEvidence();
  if (!stored || typeof stored !== "object") return base;
  return {
    ...base,
    ...stored,
    transactions: Array.isArray(stored.transactions) ? stored.transactions : [],
    networkDaysUTC: Array.isArray(stored.networkDaysUTC) ? stored.networkDaysUTC : [],
  };
}

export function saveEvidence(address: string | null, evidence: QuestEvidence): void {
  writeJSON(evidenceKey(address), evidence);
}

export interface Profile {
  /** Display name used on the local leaderboard. */
  alias: string;
}

export function loadProfile(): Profile {
  const stored = readJSON<Partial<Profile>>(PROFILE_KEY);
  const alias = typeof stored?.alias === "string" && stored.alias.trim() ? stored.alias : "You";
  return { alias };
}

export function saveProfile(profile: Profile): void {
  writeJSON(PROFILE_KEY, profile);
}
