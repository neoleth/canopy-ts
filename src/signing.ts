import { bls12_381 } from "@noble/curves/bls12-381.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { CurveType, KEY_SIZES } from "./types.js";

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt("0x" + bytesToHex(bytes));
}

/**
 * Sign a message with a private key, using the given curve's native
 * signature format — compact (r,s) for {@link CurveType.SECP256K1}/
 * {@link CurveType.ETHSECP256K1} (matches Go's SECP256K1 signature format,
 * no recovery byte), standard Ed25519 for {@link CurveType.ED25519}, and a
 * BLS12-381 G2 point for {@link CurveType.BLS12381}.
 *
 * @returns The signature, hex-encoded.
 * @throws {Error} if the private key's byte length doesn't match the
 * curve's expected size, or the curve type is unsupported.
 */
export function signMessage(
  messageBytes: Uint8Array,
  privateKeyHex: string,
  curveType: CurveType
): string {
  const privKeyBytes = hexToBytes(privateKeyHex);

  switch (curveType) {
    case CurveType.BLS12381:
      return signBLS12381(messageBytes, privKeyBytes);
    case CurveType.ED25519:
      return signEd25519(messageBytes, privKeyBytes);
    case CurveType.SECP256K1:
    case CurveType.ETHSECP256K1:
      return signSECP256K1(messageBytes, privKeyBytes);
    default:
      throw new Error(`Unsupported curve type: ${curveType}`);
  }
}

function signBLS12381(
  messageBytes: Uint8Array,
  privKeyBytes: Uint8Array
): string {
  if (privKeyBytes.length !== KEY_SIZES.PRIVATE.BLS12381) {
    throw new Error(`Invalid BLS12381 private key size: ${privKeyBytes.length}`);
  }

  const x = bytesToBigInt(privKeyBytes);
  const Hm = bls12_381.G2.hashToCurve(messageBytes) as any;
  const sigPoint = Hm.multiply(x);
  const signature = sigPoint.toBytes(true) as Uint8Array;

  if (signature.length !== KEY_SIZES.SIGNATURE.BLS12381) {
    throw new Error(`Invalid BLS12381 signature size: ${signature.length}`);
  }

  return bytesToHex(signature);
}

function signEd25519(
  messageBytes: Uint8Array,
  privKeyBytes: Uint8Array
): string {
  if (privKeyBytes.length !== KEY_SIZES.PRIVATE.ED25519) {
    throw new Error(`Invalid Ed25519 private key size: ${privKeyBytes.length}`);
  }
  return bytesToHex(ed25519.sign(messageBytes, privKeyBytes));
}

function signSECP256K1(
  messageBytes: Uint8Array,
  privKeyBytes: Uint8Array
): string {
  if (privKeyBytes.length !== KEY_SIZES.PRIVATE.SECP256K1) {
    throw new Error(`Invalid SECP256K1 private key size: ${privKeyBytes.length}`);
  }
  // compact (r,s) without recovery byte — matches Go SECP256K1 signature format
  // noble/curves v2 sign() returns Uint8Array directly in compact format
  return bytesToHex(secp256k1.sign(messageBytes, privKeyBytes) as unknown as Uint8Array);
}

/**
 * Derive the public key for a private key, in the curve's canonical
 * on-chain encoding — compressed 33-byte point for
 * {@link CurveType.SECP256K1}, uncompressed-minus-prefix 64 bytes for
 * {@link CurveType.ETHSECP256K1} (Ethereum convention), standard Ed25519
 * public key for {@link CurveType.ED25519}, and a compressed BLS12-381 G1
 * point for {@link CurveType.BLS12381}.
 *
 * @returns The public key, hex-encoded.
 * @throws {Error} if the curve type is unsupported.
 */
export function derivePublicKey(
  privateKeyHex: string,
  curveType: CurveType
): string {
  const privKeyBytes = hexToBytes(privateKeyHex);

  switch (curveType) {
    case CurveType.BLS12381: {
      const x = bytesToBigInt(privKeyBytes);
      const pubKeyPoint = bls12_381.G1.Point.BASE.multiply(x);
      return bytesToHex(pubKeyPoint.toBytes(true));
    }
    case CurveType.ED25519:
      return bytesToHex(ed25519.getPublicKey(privKeyBytes));
    case CurveType.SECP256K1:
      return bytesToHex(secp256k1.getPublicKey(privKeyBytes, true)); // compressed 33 bytes
    case CurveType.ETHSECP256K1: {
      const uncompressed = secp256k1.getPublicKey(privKeyBytes, false); // 65 bytes with 0x04
      return bytesToHex(uncompressed.slice(1)); // strip prefix → 64 bytes
    }
    default:
      throw new Error(`Unsupported curve type: ${curveType}`);
  }
}
