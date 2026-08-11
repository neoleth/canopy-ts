import protobuf from "protobufjs";
import { hexToBytes } from "@noble/hashes/utils.js";
import { bytesToBase64 } from "./base64.js";

function shouldOmit(value: any): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value === "") return true;
  if (value instanceof Uint8Array && value.length === 0) return true;
  if (typeof value === "number" && value === 0) return true;
  if (typeof value === "boolean" && !value) return true;
  return Array.isArray(value) && value.length === 0;
}

const root = protobuf.Root.fromJSON({
  nested: {
    types: {
      nested: {
        Transaction: {
          fields: {
            message_type: { type: "string", id: 1 },
            msg: { type: "google.protobuf.Any", id: 2 },
            signature: { type: "Signature", id: 3 },
            created_height: { type: "uint64", id: 4 },
            time: { type: "uint64", id: 5 },
            fee: { type: "uint64", id: 6 },
            memo: { type: "string", id: 7 },
            network_id: { type: "uint64", id: 8 },
            chain_id: { type: "uint64", id: 9 },
          },
        },
        Signature: {
          fields: {
            public_key: { type: "bytes", id: 1 },
            signature: { type: "bytes", id: 2 },
          },
        },
        MessageSend: {
          fields: {
            from_address: { type: "bytes", id: 1 },
            to_address: { type: "bytes", id: 2 },
            amount: { type: "uint64", id: 3 },
          },
        },
        MessageUnstake: {
          fields: {
            from_address: { type: "bytes", id: 1 },
          },
        },
        MessagePause: {
          fields: {
            address: { type: "bytes", id: 1 },
          },
        },
        MessageUnpause: {
          fields: {
            address: { type: "bytes", id: 1 },
          },
        },
        MessageStake: {
          fields: {
            public_key: { type: "bytes", id: 1 },
            amount: { type: "uint64", id: 2 },
            committees: { type: "uint64", id: 3, rule: "repeated" },
            net_address: { type: "string", id: 4 },
            output_address: { type: "bytes", id: 5 },
            delegate: { type: "bool", id: 6 },
            compound: { type: "bool", id: 7 },
          },
        },
        MessageEditStake: {
          fields: {
            address: { type: "bytes", id: 1 },
            amount: { type: "uint64", id: 2 },
            committees: { type: "uint64", id: 3, rule: "repeated" },
            net_address: { type: "string", id: 4 },
            output_address: { type: "bytes", id: 5 },
            compound: { type: "bool", id: 6 },
          },
        },
        MessageSubsidy: {
          fields: {
            address: { type: "bytes", id: 1 },
            chain_id: { type: "uint64", id: 2 },
            amount: { type: "uint64", id: 3 },
            opcode: { type: "bytes", id: 4 },
          },
        },
        MessageDAOTransfer: {
          fields: {
            address: { type: "bytes", id: 1 },
            amount: { type: "uint64", id: 2 },
            start_height: { type: "uint64", id: 4 },
            end_height: { type: "uint64", id: 5 },
          },
        },
        MessageCreateOrder: {
          fields: {
            chain_id: { type: "uint64", id: 1 },
            data: { type: "bytes", id: 2 },
            amount_for_sale: { type: "uint64", id: 3 },
            requested_amount: { type: "uint64", id: 4 },
            seller_receive_address: { type: "bytes", id: 5 },
            sellers_send_address: { type: "bytes", id: 6 },
          },
        },
        MessageEditOrder: {
          fields: {
            order_id: { type: "bytes", id: 1 },
            chain_id: { type: "uint64", id: 2 },
            data: { type: "bytes", id: 3 },
            amount_for_sale: { type: "uint64", id: 4 },
            requested_amount: { type: "uint64", id: 5 },
            seller_receive_address: { type: "bytes", id: 6 },
          },
        },
        MessageDeleteOrder: {
          fields: {
            order_id: { type: "bytes", id: 1 },
            chain_id: { type: "uint64", id: 2 },
          },
        },
        MessageDexLimitOrder: {
          fields: {
            chain_id: { type: "uint64", id: 1 },
            amount_for_sale: { type: "uint64", id: 2 },
            requested_amount: { type: "uint64", id: 3 },
            address: { type: "bytes", id: 4 },
          },
        },
        MessageDexLiquidityDeposit: {
          fields: {
            chain_id: { type: "uint64", id: 1 },
            amount: { type: "uint64", id: 2 },
            address: { type: "bytes", id: 3 },
            order_id: { type: "bytes", id: 4 },
          },
        },
        MessageDexLiquidityWithdraw: {
          fields: {
            chain_id: { type: "uint64", id: 1 },
            percent: { type: "uint64", id: 2 },
            address: { type: "bytes", id: 3 },
            order_id: { type: "bytes", id: 4 },
          },
        },
      },
    },
    google: {
      nested: {
        protobuf: {
          nested: {
            Any: {
              fields: {
                type_url: { type: "string", id: 1 },
                value: { type: "bytes", id: 2 },
              },
            },
          },
        },
      },
    },
  },
});

const Transaction = root.lookupType("types.Transaction");
const MsgSend = root.lookupType("types.MessageSend");
const MsgUnstake = root.lookupType("types.MessageUnstake");
const MsgPause = root.lookupType("types.MessagePause");
const MsgUnpause = root.lookupType("types.MessageUnpause");
const MsgStake = root.lookupType("types.MessageStake");
const MsgEditStake = root.lookupType("types.MessageEditStake");
const MsgSubsidy = root.lookupType("types.MessageSubsidy");
const MsgDAOTransfer = root.lookupType("types.MessageDAOTransfer");
const MsgCreateOrder = root.lookupType("types.MessageCreateOrder");
const MsgEditOrder = root.lookupType("types.MessageEditOrder");
const MsgDeleteOrder = root.lookupType("types.MessageDeleteOrder");
const MsgDexLimitOrder = root.lookupType("types.MessageDexLimitOrder");
const MsgDexLiquidityDeposit = root.lookupType("types.MessageDexLiquidityDeposit");
const MsgDexLiquidityWithdraw = root.lookupType("types.MessageDexLiquidityWithdraw");

// Message type registry: tx type -> { typeName, encoder, protojson encoder }
const MESSAGE_REGISTRY: Record<
  string,
  {
    typeName: string;
    encode: (msg: any) => Uint8Array;
    /**
     * Registered core types only (send, stake, ...): converts wire-form msg params
     * to the node's protojson `msg` shape (base64 bytes fields, camelCase names).
     * Plugin types don't set this — they submit via msgTypeUrl/msgBytes instead.
     */
    toProtojson?: (msg: any) => Record<string, unknown>;
  }
> = {
  send: {
    typeName: "types.MessageSend",
    encode: (msg) =>
      MsgSend.encode(
        MsgSend.create({
          from_address: hexToBytes(msg.fromAddress),
          to_address: hexToBytes(msg.toAddress),
          amount: msg.amount,
        })
      ).finish(),
    toProtojson: (msg) => ({
      fromAddress: bytesToBase64(hexToBytes(msg.fromAddress)),
      toAddress: bytesToBase64(hexToBytes(msg.toAddress)),
      amount: msg.amount,
    }),
  },
  unstake: {
    typeName: "types.MessageUnstake",
    encode: (msg) =>
      MsgUnstake.encode(
        MsgUnstake.create({
          from_address: hexToBytes(msg.fromAddress),
        })
      ).finish(),
    toProtojson: (msg) => ({
      fromAddress: bytesToBase64(hexToBytes(msg.fromAddress)),
    }),
  },
  pause: {
    typeName: "types.MessagePause",
    encode: (msg) =>
      MsgPause.encode(
        MsgPause.create({
          address: hexToBytes(msg.address),
        })
      ).finish(),
    toProtojson: (msg) => ({
      address: bytesToBase64(hexToBytes(msg.address)),
    }),
  },
  unpause: {
    typeName: "types.MessageUnpause",
    encode: (msg) =>
      MsgUnpause.encode(
        MsgUnpause.create({
          address: hexToBytes(msg.address),
        })
      ).finish(),
    toProtojson: (msg) => ({
      address: bytesToBase64(hexToBytes(msg.address)),
    }),
  },
  stake: {
    typeName: "types.MessageStake",
    encode: (msg) =>
      MsgStake.encode(
        MsgStake.create({
          public_key: hexToBytes(msg.publicKey),
          amount: msg.amount,
          committees: msg.committees || [],
          net_address: msg.netAddress || "",
          output_address: hexToBytes(msg.outputAddress || ""),
          delegate: msg.delegate || false,
          compound: msg.compound || false,
        })
      ).finish(),
    toProtojson: (msg) => ({
      publicKey: bytesToBase64(hexToBytes(msg.publicKey)),
      amount: msg.amount,
      committees: msg.committees || [],
      netAddress: msg.netAddress || "",
      outputAddress: msg.outputAddress ? bytesToBase64(hexToBytes(msg.outputAddress)) : "",
      delegate: msg.delegate || false,
      compound: msg.compound || false,
    }),
  },
  editStake: {
    typeName: "types.MessageEditStake",
    encode: (msg) =>
      MsgEditStake.encode(
        MsgEditStake.create({
          address: hexToBytes(msg.address),
          amount: msg.amount,
          committees: msg.committees || [],
          net_address: msg.netAddress || "",
          output_address: hexToBytes(msg.outputAddress || ""),
          compound: msg.compound || false,
        })
      ).finish(),
    toProtojson: (msg) => ({
      address: bytesToBase64(hexToBytes(msg.address)),
      amount: msg.amount,
      committees: msg.committees || [],
      netAddress: msg.netAddress || "",
      outputAddress: msg.outputAddress ? bytesToBase64(hexToBytes(msg.outputAddress)) : "",
      compound: msg.compound || false,
    }),
  },
  subsidy: {
    typeName: "types.MessageSubsidy",
    encode: (msg) =>
      MsgSubsidy.encode(
        MsgSubsidy.create({
          address: hexToBytes(msg.address),
          chain_id: msg.chainId,
          amount: msg.amount,
          opcode: hexToBytes(msg.opcode || "00"),
        })
      ).finish(),
    toProtojson: (msg) => ({
      address: bytesToBase64(hexToBytes(msg.address)),
      chainId: msg.chainId,
      amount: msg.amount,
      opcode: bytesToBase64(hexToBytes(msg.opcode || "00")),
    }),
  },
  daoTransfer: {
    typeName: "types.MessageDAOTransfer",
    encode: (msg) =>
      MsgDAOTransfer.encode(
        MsgDAOTransfer.create({
          address: hexToBytes(msg.address),
          amount: msg.amount,
          start_height: msg.startHeight,
          end_height: msg.endHeight,
        })
      ).finish(),
    toProtojson: (msg) => ({
      address: bytesToBase64(hexToBytes(msg.address)),
      amount: msg.amount,
      startHeight: msg.startHeight,
      endHeight: msg.endHeight,
    }),
  },
  createOrder: {
    typeName: "types.MessageCreateOrder",
    encode: (msg) =>
      MsgCreateOrder.encode(
        MsgCreateOrder.create({
          chain_id: msg.chainId,
          data: hexToBytes(msg.data || ""),
          amount_for_sale: msg.amountForSale,
          requested_amount: msg.requestedAmount,
          seller_receive_address: hexToBytes(msg.sellerReceiveAddress || ""),
          sellers_send_address: hexToBytes(msg.sellersSendAddress),
        })
      ).finish(),
    toProtojson: (msg) => ({
      chainId: msg.chainId,
      data: msg.data ? bytesToBase64(hexToBytes(msg.data)) : "",
      amountForSale: msg.amountForSale,
      requestedAmount: msg.requestedAmount,
      sellerReceiveAddress: msg.sellerReceiveAddress ? bytesToBase64(hexToBytes(msg.sellerReceiveAddress)) : "",
      sellersSendAddress: bytesToBase64(hexToBytes(msg.sellersSendAddress)),
    }),
  },
  editOrder: {
    typeName: "types.MessageEditOrder",
    encode: (msg) =>
      MsgEditOrder.encode(
        MsgEditOrder.create({
          order_id: hexToBytes(msg.orderId),
          chain_id: msg.chainId,
          data: hexToBytes(msg.data || ""),
          amount_for_sale: msg.amountForSale,
          requested_amount: msg.requestedAmount,
          seller_receive_address: hexToBytes(msg.sellerReceiveAddress || ""),
        })
      ).finish(),
    toProtojson: (msg) => ({
      orderId: bytesToBase64(hexToBytes(msg.orderId)),
      chainId: msg.chainId,
      data: msg.data ? bytesToBase64(hexToBytes(msg.data)) : "",
      amountForSale: msg.amountForSale,
      requestedAmount: msg.requestedAmount,
      sellerReceiveAddress: msg.sellerReceiveAddress ? bytesToBase64(hexToBytes(msg.sellerReceiveAddress)) : "",
    }),
  },
  deleteOrder: {
    typeName: "types.MessageDeleteOrder",
    encode: (msg) =>
      MsgDeleteOrder.encode(
        MsgDeleteOrder.create({
          order_id: hexToBytes(msg.orderId),
          chain_id: msg.chainId,
        })
      ).finish(),
    toProtojson: (msg) => ({
      orderId: bytesToBase64(hexToBytes(msg.orderId)),
      chainId: msg.chainId,
    }),
  },
  dexLimitOrder: {
    typeName: "types.MessageDexLimitOrder",
    encode: (msg) =>
      MsgDexLimitOrder.encode(
        MsgDexLimitOrder.create({
          chain_id: msg.chainId,
          amount_for_sale: msg.amountForSale,
          requested_amount: msg.requestedAmount,
          address: hexToBytes(msg.address),
        })
      ).finish(),
    toProtojson: (msg) => ({
      chainId: msg.chainId,
      amountForSale: msg.amountForSale,
      requestedAmount: msg.requestedAmount,
      address: bytesToBase64(hexToBytes(msg.address)),
    }),
  },
  dexLiquidityDeposit: {
    typeName: "types.MessageDexLiquidityDeposit",
    encode: (msg) =>
      MsgDexLiquidityDeposit.encode(
        MsgDexLiquidityDeposit.create({
          chain_id: msg.chainId,
          amount: msg.amount,
          address: hexToBytes(msg.address),
          order_id: hexToBytes(msg.orderId || ""),
        })
      ).finish(),
    toProtojson: (msg) => ({
      chainId: msg.chainId,
      amount: msg.amount,
      address: bytesToBase64(hexToBytes(msg.address)),
      orderId: msg.orderId ? bytesToBase64(hexToBytes(msg.orderId)) : "",
    }),
  },
  dexLiquidityWithdraw: {
    typeName: "types.MessageDexLiquidityWithdraw",
    encode: (msg) =>
      MsgDexLiquidityWithdraw.encode(
        MsgDexLiquidityWithdraw.create({
          chain_id: msg.chainId,
          percent: msg.percent,
          address: hexToBytes(msg.address),
          order_id: hexToBytes(msg.orderId || ""),
        })
      ).finish(),
    toProtojson: (msg) => ({
      chainId: msg.chainId,
      percent: msg.percent,
      address: bytesToBase64(hexToBytes(msg.address)),
      orderId: msg.orderId ? bytesToBase64(hexToBytes(msg.orderId)) : "",
    }),
  },
};

/**
 * Register a custom message type for plugin transactions.
 * Call this at app startup to add plugin-specific message types.
 */
export function registerMessageType(
  txType: string,
  typeName: string,
  encode: (msg: any) => Uint8Array,
  toProtojson?: (msg: any) => Record<string, unknown>
) {
  MESSAGE_REGISTRY[txType] = { typeName, encode, toProtojson };
}

const encoderCache = new Map<string, protobuf.Type>();

/**
 * Helper to define a protobuf message type and return an encoder.
 * Provide a stable typeName to enable caching — recommended for all call sites.
 * If omitted, a fingerprint of the field definitions is used as the cache key.
 */
export function createProtobufEncoder(
  fields: Record<string, { type: string; id: number; rule?: string; options?: any }>,
  typeName?: string
): protobuf.Type {
  const key = typeName ?? JSON.stringify(Object.entries(fields).sort());
  const cached = encoderCache.get(key);
  if (cached) return cached;
  const name = typeName ?? "DynamicMsg_" + encoderCache.size;
  const msgType = new protobuf.Type(name);
  for (const [fieldName, field] of Object.entries(fields)) {
    msgType.add(new protobuf.Field(fieldName, field.id, field.type, field.rule, undefined, field.options));
  }
  root.add(msgType);
  encoderCache.set(key, msgType);
  return msgType;
}

/**
 * Get canonical sign bytes for a transaction (protobuf-encoded, no signature).
 * Must match Go's crypto.GetSignBytes() exactly.
 */
export function getSignBytesProtobuf(tx: {
  type: string;
  msg: any;
  time: number;
  createdHeight: number;
  fee: number;
  memo?: string;
  networkID: number;
  chainID: number;
}): Uint8Array {
  const entry = MESSAGE_REGISTRY[tx.type];
  if (!entry) throw new Error(`Unknown message type: ${tx.type}`);

  const msgBytes = entry.encode(tx.msg);
  const anyMsg = {
    type_url: `type.googleapis.com/${entry.typeName}`,
    value: msgBytes,
  };

  const transactionData: any = {
    message_type: tx.type,
    msg: anyMsg,
    created_height: tx.createdHeight,
    time: tx.time,
    network_id: tx.networkID,
    chain_id: tx.chainID,
  };

  // Omit fee and memo when zero/empty — protobufjs encodes explicit zeros as non-default
  // bytes (varint 0x00), but Go's proto3 marshal omits default-value fields entirely.
  if (!shouldOmit(tx.fee)) {
    transactionData.fee = tx.fee;
  }
  if (!shouldOmit(tx.memo)) {
    transactionData.memo = tx.memo;
  }

  return Transaction.encode(Transaction.create(transactionData)).finish();
}

/**
 * Encode a message to protobuf bytes + get its type URL.
 * Used for building the msgTypeUrl/msgBytes tx format.
 */
export function encodeMessage(
  txType: string,
  msg: any
): { typeUrl: string; msgBytes: Uint8Array } {
  const entry = MESSAGE_REGISTRY[txType];
  if (!entry) throw new Error(`Unknown message type: ${txType}`);

  return {
    typeUrl: `type.googleapis.com/${entry.typeName}`,
    msgBytes: entry.encode(msg),
  };
}

/**
 * Convert wire-form msg params to the node's protojson `msg` shape for a registered
 * core type (base64 bytes fields, camelCase names). Used for the `msg`-form tx output
 * that the node's registered-core-type submission path requires — see TASKS.md.
 */
export function toProtojsonMsg(txType: string, msg: any): Record<string, unknown> {
  const entry = MESSAGE_REGISTRY[txType];
  if (!entry) throw new Error(`Unknown message type: ${txType}`);
  if (!entry.toProtojson) {
    throw new Error(`Message type '${txType}' has no protojson (core-format) encoder registered`);
  }
  return entry.toProtojson(msg);
}
