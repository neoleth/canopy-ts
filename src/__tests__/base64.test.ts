import { describe, it, expect } from "vitest";
import { bytesToBase64 } from "../base64.js";

describe("bytesToBase64", () => {
  it("encodes bytes to standard base64", () => {
    expect(bytesToBase64(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("3q2+7w==");
  });

  it("encodes empty bytes to an empty string", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });
});
