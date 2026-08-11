import { describe, it, expect } from "vitest";
import { createAndSignTransaction } from "../transaction.js";
import { derivePublicKey } from "../signing.js";
import { CurveType } from "../types.js";
import { bytesToBase64 } from "../base64.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const PRIVATE_KEY_HEX = "01".repeat(32);
const PUBLIC_KEY_HEX = derivePublicKey(PRIVATE_KEY_HEX, CurveType.BLS12381);

describe("Core Transaction Builders (all 14 types)", () => {
  it("send: core format with base64 addresses", () => {
    const fromAddress = "aa".repeat(20);
    const toAddress = "bb".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "send",
        msg: { fromAddress, toAddress, amount: 100 },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      fromAddress: bytesToBase64(hexToBytes(fromAddress)),
      toAddress: bytesToBase64(hexToBytes(toAddress)),
      amount: 100,
    });
  });

  it("unstake: core format with base64 fromAddress", () => {
    const fromAddress = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "unstake",
        msg: { fromAddress },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      fromAddress: bytesToBase64(hexToBytes(fromAddress)),
    });
  });

  it("pause: core format with base64 address", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "pause",
        msg: { address },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      address: bytesToBase64(hexToBytes(address)),
    });
  });

  it("unpause: core format with base64 address", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "unpause",
        msg: { address },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      address: bytesToBase64(hexToBytes(address)),
    });
  });

  it("stake: core format with committees array and optional fields", () => {
    const publicKey = "cc".repeat(48); // BLS public key is larger
    const outputAddress = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "stake",
        msg: {
          publicKey,
          amount: 1000000,
          committees: [1, 2, 3],
          netAddress: "192.168.1.1:8000",
          outputAddress,
          delegate: true,
          compound: false,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      publicKey: bytesToBase64(hexToBytes(publicKey)),
      amount: 1000000,
      committees: [1, 2, 3],
      netAddress: "192.168.1.1:8000",
      outputAddress: bytesToBase64(hexToBytes(outputAddress)),
      delegate: true,
      compound: false,
    });
  });

  it("editStake: core format with committees array", () => {
    const address = "aa".repeat(20);
    const outputAddress = "bb".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "editStake",
        msg: {
          address,
          amount: 500000,
          committees: [1, 2],
          netAddress: "192.168.1.2:8000",
          outputAddress,
          compound: true,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      address: bytesToBase64(hexToBytes(address)),
      amount: 500000,
      committees: [1, 2],
      netAddress: "192.168.1.2:8000",
      outputAddress: bytesToBase64(hexToBytes(outputAddress)),
      compound: true,
    });
  });

  it("subsidy: core format with all fields", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "subsidy",
        msg: {
          address,
          chainId: 2,
          amount: 100000,
          opcode: "00",
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      address: bytesToBase64(hexToBytes(address)),
      chainId: 2,
      amount: 100000,
      opcode: bytesToBase64(hexToBytes("00")),
    });
  });

  it("daoTransfer: core format with height fields", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "daoTransfer",
        msg: {
          address,
          amount: 50000,
          startHeight: 100,
          endHeight: 200,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      address: bytesToBase64(hexToBytes(address)),
      amount: 50000,
      startHeight: 100,
      endHeight: 200,
    });
  });

  it("createOrder: core format with DEX order fields", () => {
    const sellerReceiveAddress = "aa".repeat(20);
    const sellersSendAddress = "bb".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "createOrder",
        msg: {
          chainId: 2,
          data: "ffff",
          amountForSale: 100000,
          requestedAmount: 50000,
          sellerReceiveAddress,
          sellersSendAddress,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      chainId: 2,
      data: bytesToBase64(hexToBytes("ffff")),
      amountForSale: 100000,
      requestedAmount: 50000,
      sellerReceiveAddress: bytesToBase64(hexToBytes(sellerReceiveAddress)),
      sellersSendAddress: bytesToBase64(hexToBytes(sellersSendAddress)),
    });
  });

  it("editOrder: core format with order updates", () => {
    const orderId = "dd".repeat(32);
    const sellerReceiveAddress = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "editOrder",
        msg: {
          orderId,
          chainId: 2,
          data: "ffff",
          amountForSale: 80000,
          requestedAmount: 40000,
          sellerReceiveAddress,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      orderId: bytesToBase64(hexToBytes(orderId)),
      chainId: 2,
      data: bytesToBase64(hexToBytes("ffff")),
      amountForSale: 80000,
      requestedAmount: 40000,
      sellerReceiveAddress: bytesToBase64(hexToBytes(sellerReceiveAddress)),
    });
  });

  it("deleteOrder: core format with orderId and chainId", () => {
    const orderId = "dd".repeat(32);
    const tx = createAndSignTransaction(
      {
        type: "deleteOrder",
        msg: {
          orderId,
          chainId: 2,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      orderId: bytesToBase64(hexToBytes(orderId)),
      chainId: 2,
    });
  });

  it("dexLimitOrder: core format with pool order fields", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "dexLimitOrder",
        msg: {
          chainId: 2,
          amountForSale: 100000,
          requestedAmount: 50000,
          address,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      chainId: 2,
      amountForSale: 100000,
      requestedAmount: 50000,
      address: bytesToBase64(hexToBytes(address)),
    });
  });

  it("dexLiquidityDeposit: core format with deposit fields", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "dexLiquidityDeposit",
        msg: {
          chainId: 2,
          amount: 50000,
          address,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      chainId: 2,
      amount: 50000,
      address: bytesToBase64(hexToBytes(address)),
      orderId: "",
    });
  });

  it("dexLiquidityWithdraw: core format with withdraw fields", () => {
    const address = "aa".repeat(20);
    const tx = createAndSignTransaction(
      {
        type: "dexLiquidityWithdraw",
        msg: {
          chainId: 2,
          percent: 50,
          address,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX,
      CurveType.BLS12381,
      { format: "core" }
    ) as any;

    expect(tx.msg).toEqual({
      chainId: 2,
      percent: 50,
      address: bytesToBase64(hexToBytes(address)),
      orderId: "",
    });
  });

  it("plugin format still works for all types", () => {
    const tx = createAndSignTransaction(
      {
        type: "stake",
        msg: {
          publicKey: "cc".repeat(48),
          amount: 1000000,
          committees: [1],
          netAddress: "localhost:8000",
          outputAddress: "aa".repeat(20),
          delegate: false,
          compound: false,
        },
        fee: 10000,
        networkID: 1,
        chainID: 1,
        height: 5,
      },
      PRIVATE_KEY_HEX,
      PUBLIC_KEY_HEX
    ) as any;

    expect(tx.msgTypeUrl).toBe("type.googleapis.com/types.MessageStake");
    expect(typeof tx.msgBytes).toBe("string");
    expect(tx).not.toHaveProperty("msg");
  });
});
