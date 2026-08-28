/** Display + input helpers for amounts, addresses, and timestamps. */
import { isValidAddress } from "@canopynetwork/canopy-ts/crypto";
import { networkConfig } from "./canopy";

const EXPONENT = networkConfig.denomExponent;

/** Convert a chain-native (smallest-unit) amount to a display string. */
export function formatAmount(micro: number, exponent = EXPONENT): string {
  if (!Number.isFinite(micro)) return "—";
  const value = micro / 10 ** exponent;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(exponent, 6),
  });
}

export function formatWithSymbol(micro: number): string {
  return `${formatAmount(micro)} ${networkConfig.denomSymbol}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

export function shortenAddress(address: string | null | undefined, size = 6): string {
  if (!address) return "—";
  if (address.length <= size * 2 + 3) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function formatTimestamp(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  // Canopy timestamps are Unix microseconds in transaction payloads; browser
  // Date wants milliseconds. Anything past year ~2200 in ms is treated as µs.
  const ms = value > 4_000_000_000_000 ? Math.floor(value / 1000) : value;
  return new Date(ms).toLocaleString();
}

export function formatRelative(at: number | null): string {
  if (!at) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// --- transaction input validation ------------------------------------------

export interface AmountParseResult {
  ok: boolean;
  micro: number;
  error?: string;
}

/**
 * Parse a user-typed decimal amount into the chain's smallest unit.
 * Rejects anything that is not a positive, finite number with at most
 * `exponent` decimal places (more precision than the chain can represent).
 */
export function parseAmountToMicro(input: string, exponent = EXPONENT): AmountParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, micro: 0, error: "Enter an amount." };
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    return { ok: false, micro: 0, error: "Amount must be a positive number." };
  }
  const decimals = trimmed.split(".")[1]?.length ?? 0;
  if (decimals > exponent) {
    return { ok: false, micro: 0, error: `At most ${exponent} decimal places are supported.` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, micro: 0, error: "Amount must be greater than zero." };
  }
  const micro = Math.round(value * 10 ** exponent);
  if (!Number.isSafeInteger(micro)) {
    return { ok: false, micro: 0, error: "Amount is too large." };
  }
  return { ok: true, micro };
}

export interface SendValidationInput {
  recipient: string;
  amount: string;
  balanceMicro: number;
  feeMicro: number;
  selfAddress: string;
  exponent?: number;
}

export interface SendValidationResult {
  ok: boolean;
  amountMicro: number;
  totalMicro: number;
  errors: { recipient?: string; amount?: string };
}

/** Full pre-flight validation for the send form. Pure — safe to unit test. */
export function validateSend(input: SendValidationInput): SendValidationResult {
  const exponent = input.exponent ?? EXPONENT;
  const errors: { recipient?: string; amount?: string } = {};

  const recipient = input.recipient.trim().replace(/^0x/i, "");
  if (!recipient) {
    errors.recipient = "Enter a recipient address.";
  } else if (!isValidAddress(recipient)) {
    errors.recipient = "Invalid recipient address — expected 40 hex characters.";
  } else if (recipient.toLowerCase() === input.selfAddress.toLowerCase()) {
    errors.recipient = "You cannot send to your own address.";
  }

  const parsed = parseAmountToMicro(input.amount, exponent);
  if (!parsed.ok) {
    errors.amount = parsed.error;
  }

  const totalMicro = parsed.ok ? parsed.micro + input.feeMicro : 0;
  if (parsed.ok && totalMicro > input.balanceMicro) {
    errors.amount = "Insufficient balance to cover the amount plus the network fee.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    amountMicro: parsed.ok ? parsed.micro : 0,
    totalMicro,
    errors,
  };
}

/** Normalize a user-supplied address for use with the SDK (no 0x, lowercase). */
export function normalizeAddress(address: string): string {
  return address.trim().replace(/^0x/i, "").toLowerCase();
}
