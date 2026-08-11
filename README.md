# @canopynetwork/canopy-ts

TypeScript SDK for Canopy blockchain plugin frontends — signing, keystore, RPC, and WebSocket transport.

Scoped for **plugin frontends**: browser/UI code that signs transactions, manages a local keystore, and talks to a Canopy node over RPC/WebSocket, without a backend in between.

## Install

```bash
npm install @canopynetwork/canopy-ts
```

ESM only. Node ≥ 18 or any modern bundler (Vite, webpack, esbuild, Rollup).

## Importing

Prefer subpath imports — they keep your bundle to only what you use:

```ts
import { generateKeyPair } from "@canopynetwork/canopy-ts/crypto";
import { fetchHeight } from "@canopynetwork/canopy-ts/rpc";
```

Importing from the package root works too, but pulls in every subpath's
dependencies (protobufjs, zod, noble-curves, the WS transport) even if you
only need one of them:

```ts
import { generateKeyPair, fetchHeight } from "@canopynetwork/canopy-ts";
```

| Subpath | Covers |
|---|---|
| `./crypto` | Key generation, signing, address derivation, keystore encryption, transaction builders |
| `./rpc` | Node RPC query methods (accounts, blocks, transactions, validators, ...) |
| `./ws` | WebSocket transport + per-channel protobuf routing |
| `./errors` | `CanopyError` hierarchy |
| `./keystore` | Go-keystore-compatible import/export |
| `./wallet-manager` | `WalletManager` — multi-account wallet with injectable storage |
| `./node-pool` | `NodePool` — multi-node RPC client with automatic failover |
| `./transaction` | Transaction builders (`createAndSignTransaction`) |
| `./proto/*` | Raw `.proto` schema files for the WebSocket protocol |

## Quick start

### Generate a key pair and derive an address

```ts
import { generateKeyPair, deriveAddress, CurveType } from "@canopynetwork/canopy-ts/crypto";

const { privateKey, publicKey } = generateKeyPair();
const address = deriveAddress(publicKey, CurveType.ED25519);
```

### Encrypted keystore (Go-keystore compatible)

```ts
import { encryptPrivateKeyHex, decryptPrivateKeyHex } from "@canopynetwork/canopy-ts/crypto";

const { encrypted, salt } = await encryptPrivateKeyHex(privateKey, "correct horse battery staple");
const recovered = await decryptPrivateKeyHex(encrypted, salt, "correct horse battery staple");
```

### WalletManager — multi-account wallet

```ts
import { WalletManager } from "@canopynetwork/canopy-ts/wallet-manager";

// storage is injectable — implement KeystoreStorage against localStorage,
// IndexedDB, or whatever the host app already uses.
const wallet = new WalletManager({ storage: myStorage });

const accounts = await wallet.loadAccounts({ baseUrl: "https://node.example.com" });
const unlocked = await wallet.unlock(accounts[0].address, "password");
```

### RPC queries

```ts
import { fetchHeight, PageParams } from "@canopynetwork/canopy-ts/rpc";

const height = await fetchHeight({ baseUrl: "https://node.example.com" });
```

Most list endpoints accept a `pageParams` option built from `PageParams`
(`{ page, per_page }`) for pagination. For consuming an entire list without
manually advancing pages yourself, wrap the call in `paginate()`:

```ts
import { paginate, validators, eventsByAddress } from "@canopynetwork/canopy-ts/rpc";

for await (const v of paginate(opts => validators(opts))) {
  console.log(v);
}

// works with any paginated function — wrap it in a closure exposing only `opts`
for await (const e of paginate(opts => eventsByAddress(address, opts), { pageParams: { per_page: 50 } })) {
  console.log(e);
}
```

### Multi-node failover

```ts
import { NodePool } from "@canopynetwork/canopy-ts/node-pool";
import { fetchHeight } from "@canopynetwork/canopy-ts/rpc";

const pool = new NodePool([
  { name: "primary", rpc: "https://node-1.example.com" },
  { name: "backup", rpc: "https://node-2.example.com" },
]);

// Rotates to the next enabled node on connection/timeout/5xx errors;
// propagates 4xx immediately without rotating (it's not a node-health signal).
const height = await pool.withFailover((opts) => fetchHeight(opts));
```

### WebSocket transport

```ts
import { DirectTransport, ChannelRouter, makeFrameCodec, makeSystemCodec } from "@canopynetwork/canopy-ts/ws";

const root = /* load your .proto schemas — see ./proto/* exports */;
const transport = new DirectTransport({
  publicKeyHex: publicKey,
  privateKeyHex: privateKey,
  curveType: CurveType.ED25519,
  wsUrl: "wss://node.example.com/ws",
  frameCodec: makeFrameCodec(root),
  systemCodec: makeSystemCodec(root),
});

const router = new ChannelRouter(transport, root);
router.registerChannel("mychannel", "MyEnvelopeType");
router.on("mychannel", (msg) => console.log(msg));
```

### Building and signing a transaction

```ts
import { createAndSignTransaction } from "@canopynetwork/canopy-ts/transaction";

// Plugin format (default) — msgTypeUrl/msgBytes:
const tx = createAndSignTransaction(
  { type: "send", msg: { /* message fields */ }, fee: 10000, networkID: 1, chainID: 1, height: height },
  privateKey,
  publicKey,
  CurveType.ED25519,
);

// Core format — for registered on-chain types (send, stake, unstake, ...),
// which the node requires as a protojson `msg` field instead:
const coreTx = createAndSignTransaction(
  { type: "send", msg: { /* message fields */ }, fee: 10000, networkID: 1, chainID: 1, height: height },
  privateKey,
  publicKey,
  CurveType.ED25519,
  { format: "core" },
);
```

## Error handling

Every error the SDK throws extends `CanopyError`, so you can catch broadly
or narrow to a specific failure mode:

```ts
import { CanopyError, RpcError, TimeoutError } from "@canopynetwork/canopy-ts/errors";

try {
  await fetchHeight({ baseUrl });
} catch (e) {
  if (e instanceof TimeoutError) {
    // e.timeoutMs
  } else if (e instanceof RpcError) {
    // e.status, e.requestId, e.body
  } else if (e instanceof CanopyError) {
    // any other SDK error
  }
}
```

RPC calls retry transient failures (network errors, 5xx) with exponential
backoff and jitter by default (3 attempts). Disable per-call with
`{ retry: false }`, or tune `{ retry: { maxAttempts, baseDelayMs, maxDelayMs } }`.

## Versioning

This package follows [Semantic Versioning](https://semver.org/). Type
changes are treated as part of the public API — see
[CHANGELOG.md](./CHANGELOG.md) for a full history, including breaking
changes.

## License

See the repository for license details.
