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
 */
export async function submitTx(tx: object, opts: RequestOptions = {}): Promise<void> {
  await request(
    "submitTx",
    "/v1/tx",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tx) },
    opts,
  );
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
