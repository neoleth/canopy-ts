import { describe, it, expect } from "vitest";
import protobuf from "protobufjs";
import { makeFrameCodec, makeSystemCodec } from "../channel-router.js";

// Minimal ws.Frame / ws.System descriptor matching ws_frame.proto. Only the
// fields the handshake codecs touch are needed for the round-trip tests.
const root = protobuf.Root.fromJSON({
  nested: {
    ws: {
      nested: {
        Frame: {
          fields: {
            channel: { type: "string", id: 1 },
            payload: { type: "bytes", id: 2 },
          },
        },
        System: {
          oneofs: { msg: { oneof: ["challenge", "authenticated", "authResponse"] } },
          fields: {
            challenge: { type: "Challenge", id: 10 },
            authenticated: { type: "Authenticated", id: 11 },
            authResponse: { type: "AuthResponse", id: 1 },
          },
        },
        Challenge: { fields: { nonce: { type: "string", id: 1 } } },
        Authenticated: { fields: {} },
        AuthResponse: {
          fields: {
            publicKey: { type: "string", id: 1 },
            signature: { type: "string", id: 2 },
          },
        },
      },
    },
  },
});

describe("makeFrameCodec", () => {
  const codec = makeFrameCodec(root);

  it("round-trips channel + payload", () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const decoded = codec.decode(codec.encode("dice", payload));
    expect(decoded.channel).toBe("dice");
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 4]);
  });

  it("round-trips the control-plane channel (empty string)", () => {
    const decoded = codec.decode(codec.encode("", new Uint8Array([9])));
    expect(decoded.channel).toBe("");
    expect(Array.from(decoded.payload)).toEqual([9]);
  });
});

describe("makeSystemCodec", () => {
  const sys = makeSystemCodec(root);
  const systemType = root.lookupType("ws.System");

  it("decodes a challenge nonce", () => {
    const bytes = systemType
      .encode(systemType.create({ challenge: { nonce: "deadbeef" } }))
      .finish();
    const decoded = sys.decode(bytes);
    expect(decoded.challenge?.nonce).toBe("deadbeef");
    expect(decoded.authenticated).toBeFalsy();
  });

  it("decodes an authenticated message", () => {
    const bytes = systemType
      .encode(systemType.create({ authenticated: {} }))
      .finish();
    const decoded = sys.decode(bytes);
    expect(decoded.authenticated).toBeDefined();
    expect(decoded.challenge).toBeFalsy();
  });

  it("encodeAuthResponse produces a decodable ws.System", () => {
    const bytes = sys.encodeAuthResponse("pubkeyhex", "sighex");
    const msg = systemType.decode(bytes) as protobuf.Message & {
      authResponse?: { publicKey: string; signature: string };
    };
    expect(msg.authResponse?.publicKey).toBe("pubkeyhex");
    expect(msg.authResponse?.signature).toBe("sighex");
  });
});
