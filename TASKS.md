# canopy-ts TASKS

## Transaction submission for registered core message types

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
  msg: { fromAddress: <base64>, toAddress: <base64>, amount: <number> }, // protojson: base64 bytes, camelCase
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
