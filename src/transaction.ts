import { signMessage } from "./signing.js";
import { CurveType, TransactionSignature, TransactionParams } from "./types.js";
import { getSignBytesProtobuf, encodeMessage, toProtojsonMsg } from "./protobuf.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Plugin transaction format using msgTypeUrl/msgBytes.
 * This is the format accepted by the Canopy RPC /v1/tx endpoint
 * for plugin-defined message types.
 */
export interface PluginTransaction {
  type: string;
  msgTypeUrl: string;
  msgBytes: string; // hex-encoded protobuf
  signature: TransactionSignature;
  time: number;
  createdHeight: number;
  fee: number;
  memo: string;
  networkID: number;
  chainID: number;
}

/**
 * Core transaction format using a protojson `msg` field.
 * This is the format required by the Canopy RPC /v1/tx endpoint's
 * registered-core-type submission path (send, stake, unstake, ...) — that path
 * ignores msgTypeUrl/msgBytes and requires `msg` instead. See TASKS.md.
 */
export interface CoreTransaction {
  type: string;
  msg: Record<string, unknown>;
  signature: TransactionSignature;
  time: number;
  createdHeight: number;
  fee: number;
  memo: string;
  networkID: number;
  chainID: number;
}

export interface CreateAndSignTransactionOptions {
  /** "plugin" (default) emits msgTypeUrl/msgBytes; "core" emits a protojson `msg` field. */
  format?: "plugin" | "core";
}

/**
 * Build, sign, and return a transaction ready for /v1/tx submission.
 *
 * Defaults to the plugin format (msgTypeUrl/msgBytes). Pass `{ format: "core" }` for
 * registered core message types (send, stake, unstake, ...), which the node requires
 * in protojson `msg` form instead.
 */
export function createAndSignTransaction(
  params: TransactionParams,
  privateKeyHex: string,
  publicKeyHex: string,
  curveType?: CurveType,
  options?: { format?: "plugin" } | undefined
): PluginTransaction;
export function createAndSignTransaction(
  params: TransactionParams,
  privateKeyHex: string,
  publicKeyHex: string,
  curveType: CurveType | undefined,
  options: { format: "core" }
): CoreTransaction;
export function createAndSignTransaction(
  params: TransactionParams,
  privateKeyHex: string,
  publicKeyHex: string,
  curveType: CurveType = CurveType.BLS12381,
  options: CreateAndSignTransactionOptions = {}
): PluginTransaction | CoreTransaction {
  const txTime = Date.now() * 1000; // Unix microseconds

  // Get protobuf sign bytes (unsigned tx)
  const signBytes = getSignBytesProtobuf({
    type: params.type,
    msg: params.msg,
    time: txTime,
    createdHeight: params.height,
    fee: params.fee,
    memo: params.memo,
    networkID: params.networkID,
    chainID: params.chainID,
  });

  // Sign
  const signatureHex = signMessage(signBytes, privateKeyHex, curveType);

  const signature: TransactionSignature = {
    publicKey: publicKeyHex,
    signature: signatureHex,
  };
  const common = {
    type: params.type,
    signature,
    time: txTime,
    createdHeight: params.height,
    fee: params.fee,
    memo: params.memo || "",
    networkID: params.networkID,
    chainID: params.chainID,
  };

  if (options.format === "core") {
    return { ...common, msg: toProtojsonMsg(params.type, params.msg) };
  }

  // Encode message for msgTypeUrl/msgBytes format
  const { typeUrl, msgBytes } = encodeMessage(params.type, params.msg);
  return { ...common, msgTypeUrl: typeUrl, msgBytes: bytesToHex(msgBytes) };
}
