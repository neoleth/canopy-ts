/**
 * @canopynetwork/canopy-ts — Canopy blockchain TypeScript SDK
 *
 * Subpath imports (recommended):
 *   import { ... } from "@canopynetwork/canopy-ts/crypto"  — signing, encoding, wallets
 *   import { ... } from "@canopynetwork/canopy-ts/rpc"     — node RPC helpers
 *   import { ... } from "@canopynetwork/canopy-ts/ws"      — WebSocket transport
 *   import { ... } from "@canopynetwork/canopy-ts/errors"  — error classes
 *
 * Or import everything from the root for convenience:
 *   import { ... } from "@canopynetwork/canopy-ts"
 */

export * from "./crypto.js";
export * from "./rpc.js";
export * from "./ws.js";
export * from "./errors.js";
export { WalletManager } from "./wallet-manager.js";
export type { WalletAccount } from "./types.js";

// Key generation and encryption
export {
  generateKeyPair,
  encryptPrivateKey,
  encryptPrivateKeyHex,
  decryptPrivateKey,
  decryptPrivateKeyHex,
} from "./wallet.js";
export type { GeneratedKeyPair } from "./wallet.js";

// Keystore management
export {
  importFromGoKeystore,
  decryptEntry,
  encryptKeyEntry,
} from "./keystore.js";
export type {
  GoKeystoreEntry,
  ParsedKeystoreEntry,
  NewKeyEntryArgs,
  KeystoreStorage,
} from "./keystore.js";

// Additional types
export type { UnlockedAccount, LoadedAccount } from "./types.js";
