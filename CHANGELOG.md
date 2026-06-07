# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-07

### Breaking Changes

- **Removed `PortalTransport` and `createTransport`.** The portal-iframe
  embedding protocol (postMessage proxying to a parent frame) and its
  parent-origin policy are deployment concerns of the casino application, not
  the chain SDK — keeping them here was a separation-of-concerns leak and the
  source of a parent-origin bug (the transport defaulted the parent origin to
  the game's own origin, so every game→portal message was dropped). They now
  live in `@canopynetwork/casino-client` as `PortalTransport` /
  `createGameTransport`. Standalone callers should construct `DirectTransport`
  directly; portal-embedded games use `createGameTransport` from casino-client.
- The SDK now exposes only the `GameTransport` port and `DirectTransport`.

### Added

- `./proto` package export and `publishedWsProtos` manifest; a `copy-ws-protos`
  postbuild step ships the WS `.proto` schemas in `dist/proto/` so consumers can
  serve them as static assets.

## [0.4.0] - 2026-06-06

### Breaking Changes

- **WebSocket wire is now pure binary protobuf.** All JSON framing is removed.
  Every message is a `ws.Frame{channel, payload}`; control-plane messages
  (challenge/response auth, subscribe, begin/end block, error) ride channel `""`
  as `ws.System`; each game channel carries its own protobuf `Envelope`.
- `DirectTransportConfig` now **requires** `frameCodec` and `systemCodec`
  (build with `makeFrameCodec(root)` / `makeSystemCodec(root)`). The transport
  performs the binary challenge-response handshake itself before `onOpen` fires.
- `DirectTransport.send(msg: object)` (JSON) now throws — use `ChannelRouter`.

### Added

- `ChannelRouter` — per-channel protobuf routing over a `GameTransport`:
  `registerChannel`, `on`, `onSystem`, `send`, `sendSystem`.
- `makeFrameCodec(root)` / `makeSystemCodec(root)` helpers and the
  `FrameCodec` / `SystemCodec` types, exported from the `/ws` subpath.

## [0.2.0] - 2026-02-27

### Breaking Changes

- Upgraded `@noble/hashes` and `@noble/curves` to v2.0.1. Noble v2 renamed
  several module entry points. If your package imports noble directly alongside
  `canopy-crypto`, update the following paths:
  - `@noble/hashes/sha256.js` → `@noble/hashes/sha2.js`
  - `@noble/hashes/ripemd160.js` → `@noble/hashes/legacy.js`

## [0.1.0] - Initial release
