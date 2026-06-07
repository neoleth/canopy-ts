import { hexToBytes } from "@noble/hashes/utils.js";
import { signMessage } from "./signing.js";
import { CurveType } from "./types.js";
import { TransportError } from "./errors.js";

export interface GameTransport {
  connect(): void;
  disconnect(): void;
  /**
   * @deprecated The wire is pure-binary protobuf now. There is no JSON path.
   * DirectTransport throws from this method — route game/control messages
   * through a ChannelRouter (which calls `sendBinary`) instead. The method
   * remains on the interface only for source-compatibility with callers that
   * still reference it.
   */
  send(msg: object): void;
  sendBinary(data: ArrayBuffer): void;
  onMessage: ((msg: unknown) => void) | null;
  onBinary: ((data: ArrayBuffer) => void) | null;
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
  readonly connected: boolean;
}

/**
 * Decodes the inner ws.System control message and builds the AuthResponse
 * reply. Injected so the transport stays decoupled from protobufjs. Build one
 * with `makeSystemCodec(root)` from "./channel-router.js".
 */
export interface SystemCodec {
  /** Decode a ws.System payload; only the relevant oneof field is populated. */
  decode(bytes: Uint8Array): {
    challenge?: { nonce: string };
    authenticated?: Record<string, never>;
  };
  /** Encode a ws.System{auth_response{public_key, signature}} payload. */
  encodeAuthResponse(publicKeyHex: string, signatureHex: string): Uint8Array;
}

/**
 * Encodes/decodes the outer ws.Frame{channel,payload}. Injected so the
 * transport stays decoupled from protobufjs. Build one with
 * `makeFrameCodec(root)` from "./channel-router.js".
 */
export interface FrameCodec {
  decode(bytes: Uint8Array): { channel: string; payload: Uint8Array };
  encode(channel: string, payload: Uint8Array): Uint8Array;
}

export interface DirectTransportConfig {
  publicKeyHex: string;
  privateKeyHex: string;
  curveType: CurveType;
  wsUrl?: string;
  /**
   * ws.Frame codec. Required: the transport performs the binary handshake
   * itself (it holds the keys) and must frame/unframe control messages.
   * Use `makeFrameCodec(root)`.
   */
  frameCodec: FrameCodec;
  /**
   * ws.System codec used during the handshake. Use `makeSystemCodec(root)`.
   */
  systemCodec: SystemCodec;
  /** Initial reconnect backoff in ms (doubles each attempt). Default 1000. */
  reconnectBaseDelayMs?: number;
  /** Upper bound on reconnect backoff in ms. Default 30000. */
  reconnectMaxDelayMs?: number;
}

export class DirectTransport implements GameTransport {
  onMessage: ((msg: unknown) => void) | null = null;
  onBinary: ((data: ArrayBuffer) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  private _connected = false;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private shouldReconnect = false;
  private authenticated = false;

  private readonly publicKeyHex: string;
  private readonly privateKeyHex: string;
  private readonly curveType: CurveType;
  private readonly wsUrl: string;
  private readonly frameCodec: FrameCodec;
  private readonly systemCodec: SystemCodec;
  private readonly reconnectBaseDelay: number;
  private readonly reconnectMaxDelay: number;

  constructor(config: DirectTransportConfig) {
    this.publicKeyHex = config.publicKeyHex;
    this.privateKeyHex = config.privateKeyHex;
    this.curveType = config.curveType;
    this.wsUrl = config.wsUrl ?? "ws://localhost:36660/ws";
    this.frameCodec = config.frameCodec;
    this.systemCodec = config.systemCodec;
    this.reconnectBaseDelay = config.reconnectBaseDelayMs ?? 1000;
    this.reconnectMaxDelay = config.reconnectMaxDelayMs ?? 30000;
    this.reconnectDelay = this.reconnectBaseDelay;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(_msg: object): void {
    throw new TransportError(
      "JSON send removed — the wire is pure-binary protobuf. " +
        "Use ChannelRouter (send/sendSystem), which calls sendBinary.",
    );
  }

  sendBinary(data: ArrayBuffer): void {
    if (!this.ws || !this._connected) {
      throw new TransportError("WebSocket not connected");
    }
    this.ws.send(data);
  }

  private openSocket(): void {
    const ws = new WebSocket(this.wsUrl);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.authenticated = false;

    ws.onopen = () => {
      // Reset backoff on successful connection
      this.reconnectDelay = this.reconnectBaseDelay;
    };

    ws.onmessage = (event: MessageEvent) => {
      // Pure-binary wire: every frame is an ArrayBuffer ws.Frame. Anything
      // else (stray text) is ignored.
      if (!(event.data instanceof ArrayBuffer)) {
        return;
      }

      // Once authenticated, hand the raw frame straight to the ChannelRouter.
      if (this.authenticated) {
        this.onBinary?.(event.data);
        return;
      }

      // Unauthenticated phase: drive the binary handshake ourselves.
      this.handleHandshakeFrame(ws, event.data);
    };

    ws.onclose = () => {
      const wasConnected = this._connected;
      this._connected = false;
      this.authenticated = false;
      if (wasConnected) {
        this.onClose?.();
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror, reconnect handled there
    };
  }

  /**
   * Process a frame received before authentication completes. Decodes the
   * outer ws.Frame; for control-plane frames (channel === "") decodes the
   * ws.System and responds to a challenge or finalizes on `authenticated`.
   * Non-control frames before auth are ignored.
   */
  private handleHandshakeFrame(ws: WebSocket, data: ArrayBuffer): void {
    let frame: { channel: string; payload: Uint8Array };
    try {
      frame = this.frameCodec.decode(new Uint8Array(data));
    } catch {
      return; // not a Frame — ignore
    }
    if (frame.channel !== "") return; // only control-plane during handshake

    let system: ReturnType<SystemCodec["decode"]>;
    try {
      system = this.systemCodec.decode(frame.payload);
    } catch {
      return;
    }

    if (system.challenge) {
      const nonceBytes = hexToBytes(system.challenge.nonce);
      const signatureHex = signMessage(
        nonceBytes,
        this.privateKeyHex,
        this.curveType,
      );
      const payload = this.systemCodec.encodeAuthResponse(
        this.publicKeyHex,
        signatureHex,
      );
      const reply = this.frameCodec.encode("", payload);
      ws.send(reply.buffer.slice(
        reply.byteOffset,
        reply.byteOffset + reply.byteLength,
      ) as ArrayBuffer);
      // Wait for the server's `authenticated` before marking connected.
      return;
    }

    if (system.authenticated) {
      this.markConnected();
    }
  }

  private markConnected(): void {
    this.authenticated = true;
    this._connected = true;
    this.onOpen?.();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    // jitter: ±20% of current delay to spread reconnect storms
    const jitter = this.reconnectDelay * 0.2 * (2 * Math.random() - 1);
    const delay = Math.round(this.reconnectDelay + jitter);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxDelay);
  }
}

// NOTE: PortalTransport and createTransport have been RELOCATED out of this SDK
// into the casino application layer (@canopynetwork/casino-client:
// createGameTransport / PortalTransport). The portal iframe embedding protocol
// and its parent-origin policy are deployment concerns the chain SDK must not
// own — keeping them here was a separation-of-concerns leak (and the source of
// the parent-origin bug). The SDK now exposes only the GameTransport port and
// DirectTransport; application code composes the portal adapter on top.
