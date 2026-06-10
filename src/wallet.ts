import { argon2i } from "@noble/hashes/argon2.js";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { deriveAddress } from "./address.js";
import { CurveType } from "./types.js";

const ARGON2_PARAMS = {
  t: 3,
  m: 32 * 1024,
  p: 4,
};

const NONCE_LENGTH = 12;

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  const passwordBytes = new TextEncoder().encode(password);
  const key = argon2i(passwordBytes, salt, {
    t: ARGON2_PARAMS.t,
    m: ARGON2_PARAMS.m,
    p: ARGON2_PARAMS.p,
    dkLen: 32,
  });
  return new Uint8Array(key);
}

export async function decryptPrivateKey(
  encryptedHex: string,
  saltHex: string,
  password: string
): Promise<Uint8Array> {
  const salt = hexToBytes(saltHex);
  const encryptedData = hexToBytes(encryptedHex);

  const derivedKey = deriveKey(password, salt);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derivedKey as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const nonce = derivedKey.slice(0, NONCE_LENGTH);

  try {
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      encryptedData.buffer as ArrayBuffer
    );
    return new Uint8Array(decryptedData);
  } catch (error) {
    if (error instanceof Error && error.name === "OperationError") {
      throw new Error("Wrong password. Please try again.");
    }
    throw error;
  }
}

export async function decryptPrivateKeyHex(
  encryptedHex: string,
  saltHex: string,
  password: string
): Promise<string> {
  const bytes = await decryptPrivateKey(encryptedHex, saltHex, password);
  return bytesToHex(bytes);
}

export interface GeneratedKeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
  address: string;
  curveType: CurveType;
}

/**
 * Generate a fresh ed25519 keypair using a CSPRNG. Browser + modern Node both
 * provide `crypto.getRandomValues`. The address is derived via the same
 * `deriveAddress` used everywhere else, so it round-trips with the chain.
 */
export function generateKeyPair(): GeneratedKeyPair {
  const priv = new Uint8Array(32);
  crypto.getRandomValues(priv);
  const pub = ed25519.getPublicKey(priv);
  const privateKeyHex = bytesToHex(priv);
  const publicKeyHex = bytesToHex(pub);
  return {
    privateKeyHex,
    publicKeyHex,
    address: deriveAddress(publicKeyHex, CurveType.ED25519),
    curveType: CurveType.ED25519,
  };
}

/**
 * Encrypt a private key symmetrically with {@link decryptPrivateKey}: argon2i
 * KDF over a random 16-byte salt, AES-GCM with the nonce derived from the first
 * 12 bytes of the derived key. Returns hex strings ready for a keystore entry.
 */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  password: string,
): Promise<{ encrypted: string; salt: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derivedKey = deriveKey(password, salt);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derivedKey as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const nonce = derivedKey.slice(0, NONCE_LENGTH);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    privateKey.buffer as ArrayBuffer,
  );
  return {
    encrypted: bytesToHex(new Uint8Array(ciphertext)),
    salt: bytesToHex(salt),
  };
}

export async function encryptPrivateKeyHex(
  privateKeyHex: string,
  password: string,
): Promise<{ encrypted: string; salt: string }> {
  return encryptPrivateKey(hexToBytes(privateKeyHex), password);
}
