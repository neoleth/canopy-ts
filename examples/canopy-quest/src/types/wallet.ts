import type { CurveType } from "@canopynetwork/canopy-ts/crypto";

/** A wallet the app knows about. Contains no secrets — only public metadata. */
export interface WalletSummary {
  address: string;
  publicKey: string;
  curveType: CurveType;
  nickname?: string;
}

/**
 * An unlocked session. The private key lives in memory only, for as long as the
 * tab is open: it is never persisted, logged, or sent anywhere.
 */
export interface WalletSession {
  address: string;
  publicKeyHex: string;
  privateKeyHex: string;
  curveType: CurveType;
  nickname?: string;
}

export interface WalletBalance {
  /** Balance in the chain's smallest unit, exactly as the node reported it. */
  micro: number;
  /** Raw account payload, for display of any extra fields the node sent. */
  raw: Record<string, unknown>;
}

export interface SendResult {
  txHash: string;
  amountMicro: number;
  feeMicro: number;
  recipient: string;
  submittedAt: number;
}
