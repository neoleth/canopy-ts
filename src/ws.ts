/**
 * canopy-crypto/ws
 *
 * WebSocket transport layer for connecting to a Canopy node.
 * DirectTransport connects directly to the chain. The portal-iframe adapter
 * (PortalTransport / createGameTransport) lives in the casino application layer
 * (@canopynetwork/casino-client), not in this SDK.
 */

export type {
  GameTransport,
  DirectTransportConfig,
  FrameCodec,
  SystemCodec,
} from "./transport.js";
export { DirectTransport } from "./transport.js";

// Per-channel protobuf routing layer (ws.Frame + game Envelopes).
export type { ChannelHandler, SystemHandler } from "./channel-router.js";
export { ChannelRouter, makeFrameCodec, makeSystemCodec, parseProtoRoot } from "./channel-router.js";
