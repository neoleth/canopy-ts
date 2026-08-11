/**
 * @canopynetwork/canopy-ts — Canopy blockchain TypeScript SDK
 *
 * Subpath imports (recommended — smaller bundles, only pulls in what you use):
 *   import { ... } from "@canopynetwork/canopy-ts/crypto"          — signing, encoding, wallets
 *   import { ... } from "@canopynetwork/canopy-ts/rpc"             — node RPC helpers
 *   import { ... } from "@canopynetwork/canopy-ts/errors"          — error classes
 *   import { ... } from "@canopynetwork/canopy-ts/keystore"        — Go-keystore import/export
 *   import { ... } from "@canopynetwork/canopy-ts/wallet-manager"  — WalletManager (multi-account)
 *   import { ... } from "@canopynetwork/canopy-ts/node-pool"       — NodePool (multi-node failover)
 *   import { ... } from "@canopynetwork/canopy-ts/transaction"     — transaction builders
 *
 * Or import everything from the root for convenience — costs more bundle size
 * since it pulls in every subpath's dependencies (protobufjs, zod, noble-curves)
 * even if you only need one of them:
 *   import { ... } from "@canopynetwork/canopy-ts"
 */

export * from "./crypto.js";
export * from "./rpc.js";
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

// Multi-node management
export { NodePool } from "./node-pool.js";
export type { NodeEntry } from "./node-pool.js";
