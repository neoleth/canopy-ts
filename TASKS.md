# canopy-ts TASKS

## Transaction submission for registered core message types (RESOLVED)

**Gap:** `createAndSignTransaction` only emits the `msgTypeUrl` / `msgBytes`
(hex) wire form. The node's `lib.Transaction.UnmarshalJSON` honors that form
**only for plugin message types** — for *registered core types* (`send`,
`stake`, `edit_stake`, `unstake`, etc.) it takes the registered path and
requires the protojson `msg` field instead, ignoring `msgTypeUrl`/`msgBytes`.

As a result, a `send` tx built with `createAndSignTransaction` and POSTed to
`/v1/tx` is rejected with `{"Offset": 0}` (a Go `json.SyntaxError` from
`json.Unmarshal(emptyMsg, msg)` because the `msg` field is absent).

**Workaround currently needed by consumers** (see casino `load-test/bot.js`):
build the submit payload by hand —
```
{
  type: 'send',
  msg: { fromAddress: <hex>, toAddress: <hex>, amount: <number> }, // protojson: HEX bytes (not base64 — see resolution note below), camelCase (with per-type wire-key exceptions, see src/protobuf.ts MESSAGE_REGISTRY)
  signature: { publicKey: <hex>, signature: <hex> },
  time, createdHeight, fee, memo, networkID, chainID
}
```
…signing over `getSignBytesProtobuf(...)` and submitting with `fetch`.

**Proposed:**
1. Add a `msg`-form output option to `createAndSignTransaction` (or a sibling
   builder) that emits the protojson `msg` field for registered core types —
   base64-encoded bytes fields, camelCase names, numeric `amount`.
2. Add a node-RPC submit helper (e.g. `submitTransaction(rpcUrl, tx)`) so
   consumers don't hand-roll `fetch` to `/v1/tx` and re-implement response
   parsing.

**Verified working** (so the recipe is known-good): BLS12381 signing via
`signMessage` + `getSignBytesProtobuf` produces signatures the node accepts;
plugin types (`casino_deposit`) work as-is via the `msgTypeUrl`/`msgBytes`
form. Only the registered-core-type submission path needs the `msg`-form
output.

## Build: protobufjs default-import requires `esModuleInterop: false`

`channel-router.ts` uses `import protobuf from "protobufjs"`. With
`esModuleInterop: true`, tsc rewrites this to a namespace import and
`new protobuf.Root()` throws `protobuf.Root is not a constructor` at runtime
under Node ESM. `tsconfig.json` currently sets `esModuleInterop: false` to
keep the default import working — document/guard this so it isn't flipped back.

## All 15 Canopy transaction types registered (RESOLVED)

All 15 Canopy transaction types (send, stake, unstake, editStake, subsidy,
pause, unpause, changeParameter, daoTransfer, createOrder, editOrder,
deleteOrder, dexLimitOrder, dexLiquidityDeposit, dexLiquidityWithdraw) are now
registered in src/protobuf.ts's MESSAGE_REGISTRY with a `toProtojson` core-format
encoder, matching canopy-mcp's e2e-tested wire format exactly (including its
Go JSON-tag quirks — see the per-type comments in protobuf.ts).

## Core-format wire encoding is hex, not base64 (RESOLVED)

The "Transaction submission for registered core message types" note above
originally suggested base64-encoded bytes fields, based on an unverified
reference (a different consumer's bot.js). This was wrong: the node's custom
JSON unmarshaling for these message types (Go's HexBytes) expects hex
strings, confirmed two ways —
1. canopy-mcp's e2e-tested Python client (clients/canopy_transactions.py)
   sends hex.
2. Empirically: a live devnet node rejected a base64-encoded send transaction
   with `"stringToBytes() failed with err: encoding/hex: invalid byte:
   U+0050 'P'"`.

All 15 entries in src/protobuf.ts's MESSAGE_REGISTRY now use hex. Several
also have deliberately non-camelCase wire keys (documented inline per entry)
— don't "fix" those to camelCase without re-checking against canopy-mcp's
client first.

## Query method parity with canopy-mcp (RESOLVED)

27 read-only query methods from canopy-mcp's clients/canopy_queries.py are
implemented in src/rpc.ts (account, accountsBatch, blockByHash, blockByHeight,
committee, committeeData, committeesData, eventsByAddress, eventsByChain,
eventsByHeight, failedTxs, fees, nextDexBatch, orders, params, pending, pool,
retiredCommittees, subsidizedCommittees, supply, txByHash, txsByHeight,
txsByRecipient, txsBySender, validator, validators), alongside the
pre-existing fetchHeight/fetchKeystore. Spot-checked against the plan's
flagged risk areas (fee-params path, committee filter field name, pool
addend math) — all correct.

## E2E test parity with canopy-mcp (RESOLVED)

Ported canopy-mcp's Docker-devnet e2e harness and all 5 e2e suites (smoke,
stake, subsidize, dex orders, dex liquidity — 13 tests) — see tests/e2e/ and
src/__tests__/e2e/. Run via `npm run test:e2e` (Docker + a local
canopy-network/canopy checkout required; excluded from the default `npm
test` by vitest.config.ts). Default ports moved to 51004/51005 after a
collision with an unrelated local container on 51002. All 13 tests verified
passing against a live single-node devnet, including the previously-skipped
stake/subsidize/dex-orders/dex-liquidity suites (no keystore management
needed — they sign directly from raw private-key hex, same pattern as
smoke.test.ts).

Two additional live-node-only bugs were found and fixed beyond the two wire-format
plans' scope while making these suites pass:
1. protobufjs's `.encode()` writes explicit zero bytes for falsy fields
   (`{delegate: false}`) where Go's proto3 marshaler omits them entirely,
   producing sign-byte mismatches ("invalid signature") for any core-format
   type with a boolean/zero-valued field (e.g. `stake`'s `delegate`/`compound`).
   Fixed by stripping proto3-default fields before every `MESSAGE_REGISTRY`
   `encode()`'s `.create()` call (see `proto3Fields()` in src/protobuf.ts).
2. A staked validator is queried by an address derived from its own BLS
   operator public key — not by `outputAddress` (where rewards land) or by
   the funder's signing address.

## Keystore management parity with canopy-mcp (RESOLVED)

WalletManager now covers canopy-mcp's keystore_* surface except
keystore_mint_batch (a devnet-funding test convenience tied to admin RPC,
deliberately not ported — doesn't fit a general client SDK). Added this
session: deleteAccount (keystore_delete), exportEncryptedEntry
(keystore_export_encrypted), listAccounts (keystore_list, full metadata
not just addresses). Pre-existing: createWallet (keystore_new), importEntry
/loadKeystoreJson (keystore_import), unlock/unlockAccount (keystore_get),
getAccount (keystore_view, roughly).
