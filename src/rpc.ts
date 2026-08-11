import { z } from "zod";
import { importFromGoKeystore, GoKeystoreEntry, ParsedKeystoreEntry } from "./keystore.js";
import { ResponseValidationError } from "./errors.js";
import { request, RequestOptions } from "./http.js";

export type { RequestOptions, RetryConfig } from "./http.js";

// --- PageParams for paginated endpoints ------------------------------------

export interface PageParamsOptions {
  page?: number;
  per_page?: number;
  order_by?: string;
  desc?: boolean;
}

/**
 * Pagination parameters for list endpoints.
 *
 * Attributes:
 *   page - Page number (1-indexed, default: 1)
 *   per_page - Results per page (default: 20, max: 100)
 *   order_by - Sort field name
 *   desc - Sort descending (default: true)
 */
export class PageParams {
  page: number;
  per_page: number;
  order_by?: string;
  desc: boolean;

  constructor(opts?: PageParamsOptions) {
    this.page = opts?.page ?? 1;
    this.per_page = opts?.per_page ?? 20;
    this.order_by = opts?.order_by;
    this.desc = opts?.desc ?? true;
  }

  /**
   * Convert to API request parameters.
   *
   * Returns:
   *   Dict with pageNumber, perPage, orderBy (if set), desc
   */
  toDict(): Record<string, any> {
    const params: Record<string, any> = {
      pageNumber: this.page,
      perPage: this.per_page,
      desc: this.desc,
    };
    if (this.order_by) {
      params.orderBy = this.order_by;
    }
    return params;
  }
}

// --- Response schemas -------------------------------------------------------

const GoKeystoreEntrySchema = z.object({
  publicKey: z.string(),
  salt: z.string(),
  encrypted: z.string(),
  // keyAddress may be absent on the wire — it is backfilled from the map key.
  keyAddress: z.string().optional(),
  keyNickname: z.string().optional(),
});

const KeystoreResponseSchema = z.object({
  addressMap: z.record(z.string(), GoKeystoreEntrySchema).optional(),
  nicknameMap: z.record(z.string(), z.string()).optional(),
});

const HeightResponseSchema = z.object({ height: z.number() });

/**
 * Create a schema for paginated responses.
 *
 * Args:
 *   itemSchema - Schema for individual items in the results array
 *
 * Returns:
 *   Zod schema accepting { results: [...], pageNumber, perPage, desc, total, pages, ... }
 */
export function PageSchema<T>(itemSchema: z.ZodType<T>): z.ZodType<{ results: T[]; [key: string]: any }> {
  return z.object({
    results: z.array(itemSchema),
  }).passthrough();
}

/** Validate a parsed JSON body against a schema, throwing ResponseValidationError on mismatch. */
function validate<T>(label: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ResponseValidationError(`${label}: unexpected response shape`, {
      value,
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * Generic POST query helper for read-only RPC endpoints.
 *
 * Args:
 *   label - Human-readable operation name for error messages
 *   path - RPC endpoint path (e.g., "/v1/query/account")
 *   body - Request body object (will be JSON-stringified)
 *   opts - Request options (baseUrl, retry, timeout, etc.)
 *   schema - Optional Zod schema for response validation
 *
 * Returns:
 *   Parsed JSON response, optionally validated against schema
 *
 * Throws:
 *   ResponseValidationError if response does not match schema
 *   RpcError on HTTP errors or network failures
 */
export async function postQuery<T = unknown>(
  label: string,
  path: string,
  body: Record<string, any>,
  opts: RequestOptions = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const res = await request(
    label,
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    opts,
  );
  const data = await res.json();
  if (schema) {
    return validate(label, schema, data);
  }
  return data as T;
}

// --- RPC helpers ------------------------------------------------------------

/**
 * Fetch all keystore entries from the Canopy admin RPC.
 * Calls GET /v1/admin/keystore (default port 50003).
 */
export async function fetchKeystore(
  opts: RequestOptions = {},
): Promise<ParsedKeystoreEntry[]> {
  const res = await request("fetchKeystore", "/v1/admin/keystore", { method: "GET" }, opts);
  const data = validate("fetchKeystore", KeystoreResponseSchema, await res.json());
  if (!data.addressMap) return [];

  return Object.entries(data.addressMap).map(([address, entry]) => {
    const fullEntry: GoKeystoreEntry = {
      ...(entry as GoKeystoreEntry),
      keyAddress: entry.keyAddress ?? address,
    };
    return importFromGoKeystore(fullEntry);
  });
}

/**
 * Fetch the current block height from the Canopy public RPC.
 * Calls POST /v1/query/height (default port 50002).
 */
export async function fetchHeight(opts: RequestOptions = {}): Promise<number> {
  const res = await request(
    "fetchHeight",
    "/v1/query/height",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    opts,
  );
  const data = validate("fetchHeight", HeightResponseSchema, await res.json());
  return data.height;
}

/**
 * Submit a signed transaction to the Canopy public RPC.
 * Calls POST /v1/tx (default port 50002).
 *
 * Returns the response body containing the transaction hash and other metadata.
 */
export async function submitTx(tx: object, opts: RequestOptions = {}): Promise<Record<string, unknown>> {
  const res = await request(
    "submitTx",
    "/v1/tx",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tx) },
    opts,
  );
  return res.json();
}

// --- Query methods ----------------------------------------------------------

/**
 * Get account balance and details.
 *
 * Args:
 *   address: Hex address (40 characters, with or without 0x prefix)
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with address, balance, staked, height, and other account data
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function account(
  address: string,
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { height = 0, ...requestOpts } = opts;

  return postQuery("account", "/v1/query/account", {
    address: normalizedAddr,
    height,
  }, requestOpts);
}

/**
 * Get block at specific height.
 *
 * Args:
 *   height: Block height (must be > 0)
 *   opts: Request options
 *
 * Returns:
 *   Dict with block data, transactions, and metadata
 *
 * Throws:
 *   ValueError: If height is 0 or invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function blockByHeight(
  height: number,
  opts: RequestOptions = {},
): Promise<Record<string, any>> {
  if (typeof height !== "number" || height <= 0) {
    throw new Error("Height must be greater than 0");
  }

  return postQuery("blockByHeight", "/v1/query/block-by-height", {
    height,
  }, opts);
}

/**
 * Get block by hash.
 *
 * Args:
 *   blockHash: Block hash (64 character hex)
 *   opts: Request options
 *
 * Returns:
 *   Dict with block data
 *
 * Throws:
 *   ValueError: If hash format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function blockByHash(
  blockHash: string,
  opts: RequestOptions = {},
): Promise<Record<string, any>> {
  if (typeof blockHash !== "string" || blockHash.length !== 64) {
    throw new Error(`Invalid block hash format: ${blockHash}`);
  }

  return postQuery("blockByHash", "/v1/query/block-by-hash", {
    hash: blockHash,
  }, opts);
}

/**
 * Get transaction by hash.
 *
 * Args:
 *   txHash: Transaction hash (64 character hex)
 *   opts: Request options
 *
 * Returns:
 *   Dict with transaction data
 *
 * Throws:
 *   ValueError: If hash format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function txByHash(
  txHash: string,
  opts: RequestOptions = {},
): Promise<Record<string, any>> {
  if (typeof txHash !== "string" || txHash.length !== 64) {
    throw new Error(`Invalid transaction hash format: ${txHash}`);
  }

  return postQuery("txByHash", "/v1/query/tx-by-hash", {
    hash: txHash,
  }, opts);
}

/**
 * Get failed mempool transactions for an address.
 *
 * Note: there is no global index of failed transactions because Canopy
 * does not include failed transactions in blocks - this only reflects
 * transactions that failed locally.
 *
 * Args:
 *   address: Hex address of the sender (40 characters)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with failed-txs list, error details, and pagination info
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function failedTxs(
  address: string,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("failedTxs", "/v1/query/failed-txs", {
    address: normalizedAddr,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get transactions at a specific block height.
 *
 * Args:
 *   height: Block height (0 = latest committed height)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with transactions list and pagination info
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function txsByHeight(
  height: number = 0,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("txsByHeight", "/v1/query/txs-by-height", {
    height,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get transactions sent by an address.
 *
 * Args:
 *   address: Hex address of the sender (40 characters)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with transactions list and pagination info
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function txsBySender(
  address: string,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("txsBySender", "/v1/query/txs-by-sender", {
    address: normalizedAddr,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get transactions received by an address.
 *
 * Args:
 *   address: Hex address of the recipient (40 characters)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with transactions list and pagination info
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function txsByRecipient(
  address: string,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("txsByRecipient", "/v1/query/txs-by-rec", {
    address: normalizedAddr,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get unconfirmed mempool transactions.
 *
 * Args:
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with pending transactions list and pagination info
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function pending(
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("pending", "/v1/query/pending", params.toDict(), requestOpts);
}

/**
 * Look up multiple accounts concurrently in one call.
 *
 * Runs account(...) for every address concurrently via Promise.all.
 * One address's failure does not abort the others: a failed lookup produces
 * an {address: ..., error: ...} entry in its place rather than throwing.
 *
 * Args:
 *   addresses: List of hex addresses (40 characters each)
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   List of dicts, one per input address, in the same order as addresses.
 *   Each is either account()'s result with "address" merged in, or
 *   {address: <addr>, error: <str>} if that lookup failed.
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures (for the batch itself, not individual addresses)
 */
export async function accountsBatch(
  addresses: string[],
  opts: RequestOptions & { height?: number } = {},
): Promise<Array<Record<string, any>>> {
  const { height = 0, ...requestOpts } = opts;

  async function queryOne(address: string): Promise<Record<string, any>> {
    try {
      const result = await account(address, { height, ...requestOpts });
      return { ...result, address };
    } catch (e) {
      return { address, error: String(e) };
    }
  }

  return Promise.all(addresses.map(queryOne));
}

/**
 * Get committee data for a specific chain/committee ID.
 *
 * Args:
 *   committeeId: Committee/chain ID
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with committee data (last chain height, last root height, etc.)
 *
 * Throws:
 *   ValueError: If committee_id is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function committeeData(
  committeeId: number,
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  if (typeof committeeId !== "number" || committeeId < 0) {
    throw new Error(`Invalid committee ID: ${committeeId}`);
  }

  const { height = 0, ...requestOpts } = opts;

  return postQuery("committeeData", "/v1/query/committee-data", {
    id: committeeId,
    height,
  }, requestOpts);
}

/**
 * Get committee data for all chains/committees.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with all committees' data
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function committeesData(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("committeesData", "/v1/query/committees-data", {
    height,
  }, requestOpts);
}

/**
 * Get list of retired committee/chain IDs.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   List of retired chain IDs
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function retiredCommittees(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("retiredCommittees", "/v1/query/retired-committees", {
    height,
  }, requestOpts);
}

/**
 * Get list of chain IDs that receive a portion of the block reward.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   List of subsidized chain IDs
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function subsidizedCommittees(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("subsidizedCommittees", "/v1/query/subsidized-committees", {
    height,
  }, requestOpts);
}

/**
 * Get events for an address.
 *
 * Args:
 *   address: Hex address (40 characters)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with events list and pagination info
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function eventsByAddress(
  address: string,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("eventsByAddress", "/v1/query/events-by-address", {
    address: normalizedAddr,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get events for a chain/committee ID.
 *
 * Args:
 *   chainId: Chain/committee ID
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with events list and pagination info
 *
 * Throws:
 *   ValueError: If chain_id is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function eventsByChain(
  chainId: number,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  if (typeof chainId !== "number" || chainId < 0) {
    throw new Error(`Invalid chain ID: ${chainId}`);
  }

  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("eventsByChain", "/v1/query/events-by-chain", {
    id: chainId,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get events at a specific block height.
 *
 * Args:
 *   height: Block height (0 = latest committed height)
 *   opts: Request options including optional pageParams
 *
 * Returns:
 *   Dict with events list and pagination info
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function eventsByHeight(
  height: number = 0,
  opts: RequestOptions & { pageParams?: PageParams } = {},
): Promise<Record<string, any>> {
  const { pageParams, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("eventsByHeight", "/v1/query/events-by-height", {
    height,
    ...params.toDict(),
  }, requestOpts);
}

/**
 * Get validator information.
 *
 * Args:
 *   address: Validator hex address
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with validator details (stake, status, etc.)
 *
 * Throws:
 *   ValueError: If address format is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function validator(
  address: string,
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  if (typeof address !== "string" || ![40, 42].includes(address.length)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  let normalizedAddr = address;
  if (normalizedAddr.startsWith("0x") || normalizedAddr.startsWith("0X")) {
    normalizedAddr = normalizedAddr.slice(2);
  }
  normalizedAddr = normalizedAddr.toLowerCase();

  const { height = 0, ...requestOpts } = opts;

  return postQuery("validator", "/v1/query/validator", {
    address: normalizedAddr,
    height,
  }, requestOpts);
}

/**
 * Get list of validators with pagination.
 *
 * Args:
 *   opts: Request options including optional pageParams and height
 *
 * Returns:
 *   Dict with validators list and pagination info
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function validators(
  opts: RequestOptions & { pageParams?: PageParams; height?: number } = {},
): Promise<Record<string, any>> {
  const { pageParams, height = 0, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("validators", "/v1/query/validators", {
    ...params.toDict(),
    height,
  }, requestOpts);
}

/**
 * Get token supply information.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with total supply, burned, etc.
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function supply(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("supply", "/v1/query/supply", {
    height,
  }, requestOpts);
}

/**
 * Get network governance parameters.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with fee params, gov params, consensus params, etc.
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function params(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("params", "/v1/query/params", {
    height,
  }, requestOpts);
}

/**
 * Get current network fee parameters.
 *
 * Args:
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with fee information (min_fee, base_fee, etc.)
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function fees(
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("fees", "/v1/query/fee-params", {
    height,
  }, requestOpts);
}

/**
 * Get committee members.
 *
 * Args:
 *   committeeId: Committee/chain ID
 *   opts: Request options including optional pageParams and height
 *
 * Returns:
 *   Dict with committee members list and pagination info
 *
 * Throws:
 *   ValueError: If committee_id is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function committee(
  committeeId: number,
  opts: RequestOptions & { pageParams?: PageParams; height?: number } = {},
): Promise<Record<string, any>> {
  if (typeof committeeId !== "number" || committeeId < 0) {
    throw new Error(`Invalid committee ID: ${committeeId}`);
  }

  const { pageParams, height = 0, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("committee", "/v1/query/committee", {
    ...params.toDict(),
    committeeID: committeeId,
    height,
  }, requestOpts);
}

// Pool addends matching Go: uint64(N * math.MaxUint16 / 4)
// Note: math.MaxUint16 = 65535 (2^16 - 1), so:
// subsidy: 0 * 65535 / 4 = 0
// holding: 1 * 65535 / 4 = 16383
// liquidity: 2 * 65535 / 4 = 32767
// escrow: 4 * 65535 / 4 = 65535
const POOL_ADDENDS: Record<string, number> = {
  subsidy: 0,
  holding: Math.floor(1 * 65535 / 4),     // 16383
  liquidity: Math.floor(2 * 65535 / 4),   // 32767
  escrow: Math.floor(4 * 65535 / 4),      // 65535
};

async function queryPool(
  poolId: number,
  requestOpts: RequestOptions,
): Promise<Record<string, any>> {
  return postQuery("queryPool", "/v1/query/pool", {
    id: poolId,
  }, requestOpts);
}

/**
 * Query pool balance(s) for a committee/chain.
 *
 * Args:
 *   chainId: The committee/chain ID
 *   opts: Request options with optional poolType and node targeting
 *         poolType: 'subsidy' (default), 'holding', 'liquidity', 'escrow', or 'all'
 *
 * Returns:
 *   Single pool dict with pool_id, or nested dict for 'all' poolType
 *
 * Throws:
 *   ValueError: If pool_type is invalid
 *   RpcError: On HTTP errors or network failures
 */
export async function pool(
  chainId: number,
  opts: RequestOptions & { poolType?: string } = {},
): Promise<Record<string, any>> {
  const { poolType = "subsidy", ...requestOpts } = opts;

  if (poolType === "all") {
    const results: Record<string, any> = {};
    for (const [name, addend] of Object.entries(POOL_ADDENDS)) {
      const poolResult = await queryPool(chainId + addend, requestOpts);
      results[name] = { ...poolResult, pool_id: chainId + addend };
    }
    return results;
  }

  const addend = POOL_ADDENDS[poolType];
  if (addend === undefined) {
    throw new Error(
      `Unknown pool_type '${poolType}'. Valid: ${Object.keys(POOL_ADDENDS).join(", ")}, 'all'`
    );
  }

  const result = await queryPool(chainId + addend, requestOpts);
  result.pool_id = chainId + addend;
  return result;
}

/**
 * Query the not-yet-locked DEX batch for a committee.
 *
 * The queue MessageDexLiquidityDeposit/MessageDexLiquidityWithdraw append to before
 * it's locked and settled (typically 1-2 block cycles later). Useful for confirming
 * a deposit/withdraw was actually queued, since settlement itself requires a
 * counterpart chain to process the batch.
 *
 * Args:
 *   chainId: The committee/chain ID (same id passed as `committee_id` to
 *            deposit()/withdraw() -- the COUNTER-ASSET chain, not necessarily
 *            the chain being submitted to)
 *   opts: Request options including optional height parameter (0 = latest)
 *
 * Returns:
 *   Dict with DEX batch data
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function nextDexBatch(
  chainId: number,
  opts: RequestOptions & { height?: number } = {},
): Promise<Record<string, any>> {
  const { height = 0, ...requestOpts } = opts;

  return postQuery("nextDexBatch", "/v1/query/next-dex-batch", {
    id: chainId,
    height,
  }, requestOpts);
}

/**
 * List open DEX sell orders for a committee.
 *
 * Each result's "id" is the order's hex order ID -- the same value
 * edit_order()/delete_order() expect for their order_id argument.
 *
 * Args:
 *   committeeId: The committee id the orders belong to (same id passed as
 *                `committee_id` to create_order/edit_order/delete_order)
 *   opts: Request options including optional pageParams and height
 *
 * Returns:
 *   Dict with orders list and pagination info
 *
 * Throws:
 *   RpcError: On HTTP errors or network failures
 */
export async function orders(
  committeeId: number,
  opts: RequestOptions & { pageParams?: PageParams; height?: number } = {},
): Promise<Record<string, any>> {
  const { pageParams, height = 0, ...requestOpts } = opts;
  const params = pageParams || new PageParams();

  return postQuery("orders", "/v1/query/orders", {
    ...params.toDict(),
    committee: committeeId,
    height,
  }, requestOpts);
}
