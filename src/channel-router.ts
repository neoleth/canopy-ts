import protobuf from "protobufjs";
import type {
  FrameCodec,
  GameTransport,
  SystemCodec,
} from "./transport.js";
import { TransportError } from "./errors.js";

/**
 * Parse one or more `.proto` source texts into a single protobuf Root, using
 * the SDK's own protobufjs instance.
 *
 * Consumers MUST build their Root with this (not their own protobufjs) so there
 * is exactly one protobufjs instance in play — otherwise `Root` type identities
 * diverge (a Vite dedupe quirk, a hard Next.js type error) and bundlers ship two
 * copies. Pass the dependency's source FIRST so later files' `import` statements
 * resolve, e.g. `parseProtoRoot([wsFrameProto, diceWsProto])`.
 */
export function parseProtoRoot(sources: string[]): protobuf.Root {
  const root = new protobuf.Root();
  for (const src of sources) protobuf.parse(src, root, { keepCase: false });
  root.resolveAll();
  return root;
}

/**
 * Build a {@link FrameCodec} from a protobuf root containing `ws.Frame`.
 * Pass the result into `DirectTransportConfig.frameCodec`.
 */
export function makeFrameCodec(root: protobuf.Root): FrameCodec {
  const frameType = root.lookupType("ws.Frame");
  return {
    decode(bytes: Uint8Array): { channel: string; payload: Uint8Array } {
      const f = frameType.decode(bytes) as protobuf.Message & {
        channel?: string;
        payload?: Uint8Array;
      };
      return { channel: f.channel ?? "", payload: f.payload ?? new Uint8Array(0) };
    },
    encode(channel: string, payload: Uint8Array): Uint8Array {
      return frameType.encode(frameType.create({ channel, payload })).finish();
    },
  };
}

/**
 * Build a {@link SystemCodec} from a protobuf root containing `ws.System`.
 * Pass the result into `DirectTransportConfig.systemCodec`.
 */
export function makeSystemCodec(root: protobuf.Root): SystemCodec {
  const systemType = root.lookupType("ws.System");
  return {
    decode(bytes: Uint8Array): {
      challenge?: { nonce: string };
      authenticated?: Record<string, never>;
    } {
      return systemType.decode(bytes) as protobuf.Message & {
        challenge?: { nonce: string };
        authenticated?: Record<string, never>;
      };
    },
    encodeAuthResponse(publicKeyHex: string, signatureHex: string): Uint8Array {
      return systemType
        .encode(
          systemType.create({
            authResponse: { publicKey: publicKeyHex, signature: signatureHex },
          }),
        )
        .finish();
    },
  };
}

// ChannelRouter is the per-channel protobuf layer on top of a GameTransport.
//
// Wire model (see game-server/plugin/go/proto/ws_frame.proto):
//   every binary frame is a ws.Frame { channel, payload }.
//   - channel === ""  -> payload is a ws.System control message
//   - channel != ""   -> payload is that game's Envelope (dice.Envelope, ...)
//
// The router owns Frame decode + routing so games never touch the wire. A game
// registers its channel's Envelope type once; inbound messages are decoded and
// dispatched to that channel's handler. The oneof acts as the message
// discriminator (decoded.msg returns the active field name), replacing the old
// JSON "type" string.
//
// Build the root however you like — both work with the published .proto sources:
//   const root = await protobuf.load(["ws_frame.proto", "dice_ws.proto"]);
//   // or protobuf.Root.fromJSON(descriptor) to match the SDK's bundler-friendly style.

export type ChannelHandler = (envelope: protobuf.Message) => void;
export type SystemHandler = (message: protobuf.Message) => void;

export class ChannelRouter {
  private readonly transport: GameTransport;
  private readonly root: protobuf.Root;
  private readonly frameType: protobuf.Type;
  private readonly systemType: protobuf.Type;
  private readonly codecs = new Map<string, protobuf.Type>();
  private readonly handlers = new Map<string, ChannelHandler>();
  private systemHandler: SystemHandler | null = null;

  constructor(transport: GameTransport, root: protobuf.Root) {
    this.transport = transport;
    this.root = root;
    this.frameType = root.lookupType("ws.Frame");
    this.systemType = root.lookupType("ws.System");
    // Take over the binary path; JSON onMessage is left untouched for any
    // legacy text frames during migration.
    this.transport.onBinary = (data: ArrayBuffer) => this.route(data);
  }

  /** Register a channel's Envelope type by its fully-qualified proto name. */
  registerChannel(channel: string, envelopeTypeName: string): void {
    this.codecs.set(channel, this.root.lookupType(envelopeTypeName));
  }

  /** Subscribe to decoded envelopes for a channel. */
  on(channel: string, handler: ChannelHandler): void {
    this.handlers.set(channel, handler);
  }

  off(channel: string): void {
    this.handlers.delete(channel);
  }

  /** Handle control-plane (channel === "") messages: challenge, begin/end block, error. */
  onSystem(handler: SystemHandler): void {
    this.systemHandler = handler;
  }

  /** Encode a game message, wrap it in a Frame, and send it. */
  send(channel: string, msg: object): void {
    const codec = this.codecs.get(channel);
    if (!codec) throw new TransportError(`no codec registered for channel "${channel}"`);
    const payload = codec.encode(codec.create(msg)).finish();
    this.transport.sendBinary(this.wrap(channel, payload));
  }

  /** Send a control-plane (ws.System) message on channel "". */
  sendSystem(msg: object): void {
    const payload = this.systemType.encode(this.systemType.create(msg)).finish();
    this.transport.sendBinary(this.wrap("", payload));
  }

  private route(data: ArrayBuffer): void {
    let frame: protobuf.Message & { channel?: string; payload?: Uint8Array };
    try {
      frame = this.frameType.decode(new Uint8Array(data)) as typeof frame;
    } catch (err) {
      console.error("[ChannelRouter] ws.Frame decode failed:", err);
      return;
    }
    const channel = frame.channel ?? "";
    const payload = frame.payload ?? new Uint8Array(0);

    if (channel === "") {
      if (!this.systemHandler) return;
      try {
        this.systemHandler(this.systemType.decode(payload));
      } catch (err) {
        console.error("[ChannelRouter] ws.System decode failed:", err);
      }
      return;
    }
    const codec = this.codecs.get(channel);
    const handler = this.handlers.get(channel);
    if (!codec || !handler) {
      console.warn(`[ChannelRouter] no codec/handler for channel "${channel}" (registered: ${[...this.codecs.keys()].join(", ") || "none"})`);
      return;
    }
    let envelope: protobuf.Message;
    try {
      envelope = codec.decode(payload);
    } catch (err) {
      console.error(`[ChannelRouter] envelope decode failed on channel "${channel}":`, err);
      return;
    }
    handler(envelope);
  }

  private wrap(channel: string, payload: Uint8Array): ArrayBuffer {
    const framed = this.frameType.encode(this.frameType.create({ channel, payload })).finish();
    return framed.buffer.slice(framed.byteOffset, framed.byteOffset + framed.byteLength) as ArrayBuffer;
  }
}
