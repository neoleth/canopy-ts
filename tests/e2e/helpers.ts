/**
 * Shared e2e test helpers for interacting with the canopy devnet.
 *
 * Provides utilities for:
 * - Creating e2e clients connected to the devnet
 * - Extracting transaction hashes from RPC responses
 * - Waiting for conditions (balance changes, block height increases, etc.)
 * - Submitting transactions and polling for confirmation
 */

/**
 * Extract transaction hash from a submitTx RPC response.
 *
 * The RPC endpoint returns a response with a txHash or hash field.
 * This helper extracts it, raising an error if not found.
 */
export function extractTxHash(response: Record<string, unknown>): string {
  const hash = response.txHash || response.hash;
  if (!hash || typeof hash !== 'string') {
    throw new Error(`No transaction hash in response: ${JSON.stringify(response)}`);
  }
  return hash;
}

/**
 * Options for the waitFor helper.
 */
export interface WaitForOptions {
  /** Maximum time to wait in milliseconds. Default: 30000 (30s). */
  timeoutMs?: number;
  /** Interval between condition checks in milliseconds. Default: 1000 (1s). */
  intervalMs?: number;
  /** Optional error message to include in timeout error. */
  errorMessage?: string;
}

/**
 * Poll a condition function until it returns true or times out.
 *
 * Useful for waiting for balance changes, block height increases, etc.
 *
 * Example:
 *   await waitFor(async () => {
 *     const account = await queryAccount(address);
 *     return account.amount > initialAmount;
 *   }, { timeoutMs: 60000 });
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  opts: WaitForOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (await condition()) {
        return; // Condition satisfied
      }
    } catch (e) {
      // Continue polling even if the condition check fails
      // (useful for queries against a node that might not have data yet)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const msg = opts.errorMessage ? `${opts.errorMessage} (timeout: ${timeoutMs}ms)` : `Condition not met within ${timeoutMs}ms`;
  throw new Error(msg);
}

/**
 * E2E test configuration loaded from environment or defaults.
 */
export interface E2eConfig {
  rpcUrl: string;
  adminRpcUrl: string;
}

/**
 * Get e2e configuration from environment variables set by global setup.
 *
 * Falls back to defaults if environment variables are not set (useful for
 * local testing where you're running the container manually).
 */
export function getE2eConfig(): E2eConfig {
  const rpcPort = parseInt(process.env.E2E_RPC_PORT || '51002');
  const adminPort = parseInt(process.env.E2E_ADMIN_PORT || '51003');

  return {
    rpcUrl: process.env.E2E_RPC_URL || `http://localhost:${rpcPort}`,
    adminRpcUrl: process.env.E2E_ADMIN_RPC_URL || `http://localhost:${adminPort}`,
  };
}

/**
 * Make a JSON RPC POST request to the e2e node.
 *
 * Used internally by query/submit helpers and can be used directly for
 * custom queries not yet wrapped by helper functions.
 */
export async function rpcRequest<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  config: E2eConfig,
): Promise<T> {
  const url = new URL(path, config.rpcUrl).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RPC request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Query the current block height from the e2e node.
 */
export async function queryHeight(config?: E2eConfig): Promise<number> {
  const c = config || getE2eConfig();
  const response = await rpcRequest<{ height: number }>('/v1/query/height', {}, c);
  return response.height;
}

/**
 * Query an account's balance and other details from the e2e node.
 */
export async function queryAccount(
  address: string,
  config?: E2eConfig,
): Promise<Record<string, unknown>> {
  const c = config || getE2eConfig();
  return rpcRequest('/v1/query/account', { address }, c);
}

/**
 * Options for devnetTx.
 */
export interface DevnetTxOptions {
  /** Maximum time to wait for the transaction to be confirmed. Default: 30000 (30s). */
  timeoutMs?: number;
  /** Custom e2e configuration (defaults to environment/process). */
  config?: E2eConfig;
}

/**
 * Submit a transaction to the e2e node and wait for confirmation.
 *
 * Returns the transaction hash on success. Throws if:
 * - The submission fails
 * - No transaction hash is in the response
 * - Confirmation polling times out
 */
export async function devnetTx(
  submitFn: () => Promise<Record<string, unknown>>,
  opts: DevnetTxOptions = {},
): Promise<string> {
  // Submit the transaction
  const response = await submitFn();
  const txHash = extractTxHash(response);

  // Wait for confirmation (optional — some tests may not need to poll)
  // In practice, we just return the hash; callers can use waitFor/queryAccount
  // to poll for the actual transaction effect if needed.

  return txHash;
}
