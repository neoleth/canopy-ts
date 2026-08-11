/**
 * E2E test for subsidize transactions against a live single-node canopy devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAndSignTransaction } from '../../transaction.js';
import { derivePublicKey } from '../../signing.js';
import { CurveType } from '../../types.js';
import { submitTx, pool, fees } from '../../rpc.js';
import { queryHeight, waitFor, getE2eConfig } from '../../../tests/e2e/helpers.js';

const DEVNET_ADDRESS = '3db4b1ec0d9206365696e0c3a52a519840060c86';
const DEVNET_PRIVATE_KEY_HEX = '58076499043ed850ddf6675da60e666124093d3c6933fcaf6b605f4141d30958';
// Dedicated, unused-elsewhere committee id so this test's exact-equality
// assertion on the pool balance isn't order-dependent on other suites.
const COMMITTEE_ID = 99;
const SUBSIDY_AMOUNT = 50_000_000;

let config: ReturnType<typeof getE2eConfig>;

describe('E2E Subsidize Tests', () => {
  beforeAll(() => {
    config = getE2eConfig();
  });

  it('subsidize adds funds to the committee pool on the node', async () => {
    const before = ((await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl })) as any).amount as number;

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'subsidy',
        msg: { address: DEVNET_ADDRESS, chainId: COMMITTEE_ID, amount: SUBSIDY_AMOUNT },
        fee: feeParams.subsidyFee ?? 10000,
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
        const p = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl });
        return ((p as any).amount as number) > before;
      },
      { errorMessage: 'subsidy pool balance to increase' },
    );

    const after: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl });
    expect(after.amount).toBe(SUBSIDY_AMOUNT);
  });
});
