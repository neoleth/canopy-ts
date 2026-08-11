import { hexToBytes } from "@noble/hashes/utils.js";
import { CurveType, KEY_SIZES } from "./types.js";

/**
 * Infer a public key's curve type from its byte length alone. Useful when
 * a key arrives without an explicit curve tag (e.g. from a Go keystore
 * import) and the curve has to be recovered before signing/address work.
 *
 * @throws {Error} if the byte length doesn't match any known curve's public
 * key size ({@link KEY_SIZES.PUBLIC}).
 */
export function detectPublicKeyCurve(publicKeyHex: string): CurveType {
  const bytes = hexToBytes(publicKeyHex);

  switch (bytes.length) {
    case KEY_SIZES.PUBLIC.ED25519:
      return CurveType.ED25519;
    case KEY_SIZES.PUBLIC.SECP256K1:
      return CurveType.SECP256K1;
    case KEY_SIZES.PUBLIC.BLS12381:
      return CurveType.BLS12381;
    case KEY_SIZES.PUBLIC.ETHSECP256K1:
    case 65:
      return CurveType.ETHSECP256K1;
    default:
      throw new Error(`Unrecognized public key format: ${bytes.length} bytes`);
  }
}
