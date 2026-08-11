/**
 * E2E tests for DEX order transactions (create/edit/delete) against a live
 * single-node canopy devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAndSignTransaction } from '../../transaction.js';
import { derivePublicKey } from '../../signing.js';
import { CurveType } from '../../types.js';
import { submitTx, pool, orders, fees } from '../../rpc.js';
import { queryHeight, waitFor, getE2eConfig, extractTxHash } from '../../../tests/e2e/helpers.js';

const DEVNET_ADDRESS = '3db4b1ec0d9206365696e0c3a52a519840060c86';
const DEVNET_PRIVATE_KEY_HEX = '58076499043ed850ddf6675da60e666124093d3c6933fcaf6b605f4141d30958';
const COMMITTEE_ID = 3; // dedicated committee, distinct from stake's 2 and subsidize's 99
const RECEIVE_ADDRESS = 'ab'.repeat(20); // foreign-chain address — only length matters server-side
const SALE_AMOUNT = 5_000_000;
const REQUESTED_AMOUNT = 1_000_000;

let config: ReturnType<typeof getE2eConfig>;

async function createOrder(): Promise<string> {
  const height = await queryHeight(config);
  const feeParams = await fees({ baseUrl: config.rpcUrl });
  const tx = createAndSignTransaction(
    {
      type: 'createOrder',
      msg: {
        chainId: COMMITTEE_ID,
        amountForSale: SALE_AMOUNT,
        requestedAmount: REQUESTED_AMOUNT,
        sellerReceiveAddress: RECEIVE_ADDRESS,
        sellersSendAddress: DEVNET_ADDRESS,
      },
      fee: feeParams.createOrderFee ?? 10000,
      networkID: 1,
      chainID: 1,
      height,
    },
    DEVNET_PRIVATE_KEY_HEX,
    derivePublicKey(DEVNET_PRIVATE_KEY_HEX, CurveType.BLS12381),
    CurveType.BLS12381,
    { format: 'core' },
  );
  const response = await submitTx(tx, { baseUrl: config.rpcUrl });
  const txHash = extractTxHash(response);
  // The node derives OrderId from the tx hash's first 20 bytes (40 hex chars) —
  // empirically confirmed by canopy-mcp's e2e suite (test_e2e_dex_orders.py).
  const orderId = txHash.slice(0, 40);

  await waitFor(
    async () => {
      const page: any = await orders(COMMITTEE_ID, { baseUrl: config.rpcUrl });
      return (page.results as any[]).some((o) => o.id === orderId);
    },
    { errorMessage: `order ${orderId} to appear in the committee's order list`, timeoutMs: 60_000 },
  );

  return orderId;
}

describe('E2E DEX Orders Tests', () => {
  beforeAll(() => {
    config = getE2eConfig();
  });

  it('createOrder escrows funds and lists the order', async () => {
    const before = ((await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'escrow' })) as any).amount;

    const orderId = await createOrder();

    await waitFor(
      async () => {
        const p: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'escrow' });
        return p.amount > before;
      },
      { errorMessage: 'escrow pool balance to increase', timeoutMs: 60_000 },
    );
    const escrow: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'escrow' });
    expect(escrow.amount - before).toBe(SALE_AMOUNT);

    const page: any = await orders(COMMITTEE_ID, { baseUrl: config.rpcUrl });
    const order = (page.results as any[]).find((o) => o.id === orderId)!;
    expect(order.amountForSale).toBe(SALE_AMOUNT);
    expect(order.requestedAmount).toBe(REQUESTED_AMOUNT);
    expect(order.sellerReceiveAddress).toBe(RECEIVE_ADDRESS);
    expect(order.sellersSendAddress).toBe(DEVNET_ADDRESS);
  });

  it('editOrder updates amounts on the node', async () => {
    const orderId = await createOrder();
    const newSaleAmount = SALE_AMOUNT + 3_000_000;
    const newRequestedAmount = REQUESTED_AMOUNT + 1_000_000;

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'editOrder',
        msg: {
          orderId,
          chainId: COMMITTEE_ID,
          amountForSale: newSaleAmount,
          requestedAmount: newRequestedAmount,
          sellerReceiveAddress: RECEIVE_ADDRESS,
        },
        fee: feeParams.editOrderFee ?? 10000,
        networkID: 1,
        chainID: 1,
        height,
      },
      DEVNET_PRIVATE_KEY_HEX,
      derivePublicKey(DEVNET_PRIVATE_KEY_HEX, CurveType.BLS12381),
      CurveType.BLS12381,
      { format: 'core' },
    );
    await submitTx(tx, { baseUrl: config.rpcUrl });

    await waitFor(
      async () => {
        const page: any = await orders(COMMITTEE_ID, { baseUrl: config.rpcUrl });
        const o = (page.results as any[]).find((o) => o.id === orderId);
        return !!o && o.amountForSale === newSaleAmount;
      },
      { errorMessage: 'edited order to reflect the new sale amount', timeoutMs: 60_000 },
    );
    const page: any = await orders(COMMITTEE_ID, { baseUrl: config.rpcUrl });
    const order = (page.results as any[]).find((o) => o.id === orderId);
    expect(order.requestedAmount).toBe(newRequestedAmount);
  });

  it('deleteOrder removes the order and refunds escrow', async () => {
    const orderId = await createOrder();
    const withOrder = ((await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'escrow' })) as any).amount;

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'deleteOrder',
        msg: { orderId, chainId: COMMITTEE_ID },
        fee: feeParams.deleteOrderFee ?? 10000,
        networkID: 1,
        chainID: 1,
        height,
      },
      DEVNET_PRIVATE_KEY_HEX,
      derivePublicKey(DEVNET_PRIVATE_KEY_HEX, CurveType.BLS12381),
      CurveType.BLS12381,
      { format: 'core' },
    );
    await submitTx(tx, { baseUrl: config.rpcUrl });

    await waitFor(
      async () => {
        const page: any = await orders(COMMITTEE_ID, { baseUrl: config.rpcUrl });
        return (page.results as any[]).every((o) => o.id !== orderId);
      },
      { errorMessage: "order to disappear from the committee's order list", timeoutMs: 60_000 },
    );

    const afterDelete = ((await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'escrow' })) as any).amount;
    expect(withOrder - afterDelete).toBe(SALE_AMOUNT);
  });
});
