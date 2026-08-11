/**
 * E2E tests for DEX liquidity provisioning transactions (deposit/withdraw)
 * against a live single-node canopy devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAndSignTransaction } from '../../transaction.js';
import { derivePublicKey } from '../../signing.js';
import { CurveType } from '../../types.js';
import { generateKeyPair } from '../../wallet.js';
import { submitTx, pool, nextDexBatch, failedTxs, fees } from '../../rpc.js';
import { queryHeight, queryAccount, waitFor, getE2eConfig, extractTxHash } from '../../../tests/e2e/helpers.js';

const DEVNET_ADDRESS = '3db4b1ec0d9206365696e0c3a52a519840060c86';
const DEVNET_PRIVATE_KEY_HEX = '58076499043ed850ddf6675da60e666124093d3c6933fcaf6b605f4141d30958';
const COMMITTEE_ID = 2; // shared with the stake suite's non-root committee — deposit/withdraw don't care about validator staking there
// Matches src/rpc.ts's POOL_ADDENDS.liquidity (Math.floor(2 * 65535 / 4)) — the
// liquidity pool for a committee lives at chainId + this addend.
const LIQUIDITY_POOL_ADDEND = Math.floor((2 * 65535) / 4);
const BOOTSTRAP_LIQUIDITY = 100_000_000;
const DEPOSIT_AMOUNT = 10_000_000;
const FUND_AMOUNT = 500_000_000;

let config: ReturnType<typeof getE2eConfig>;

async function bootstrapLiquidityPool(): Promise<void> {
  const existing: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'liquidity' });
  if (existing.amount > 0) return; // already bootstrapped by a prior test run in this session

  // deposit() hard-rejects with ErrInvalidLiquidityPool unless the pool is
  // already nonzero — subsidizing the liquidity-pool id directly is the only
  // way to seed it.
  const height = await queryHeight(config);
  const feeParams = await fees({ baseUrl: config.rpcUrl });
  const liquidityPoolId = COMMITTEE_ID + LIQUIDITY_POOL_ADDEND;
  const tx = createAndSignTransaction(
    {
      type: 'subsidy',
      msg: { address: DEVNET_ADDRESS, chainId: liquidityPoolId, amount: BOOTSTRAP_LIQUIDITY },
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
      const p: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'liquidity' });
      return p.amount > 0;
    },
    { errorMessage: 'liquidity pool to be bootstrapped', timeoutMs: 60_000 },
  );
}

async function fundFreshKey(): Promise<{ address: string; privateKeyHex: string }> {
  const kp = generateKeyPair();
  const height = await queryHeight(config);
  const feeParams = await fees({ baseUrl: config.rpcUrl });
  const tx = createAndSignTransaction(
    {
      type: 'send',
      msg: { fromAddress: DEVNET_ADDRESS, toAddress: kp.address, amount: FUND_AMOUNT },
      fee: feeParams.sendFee ?? 10000,
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
      const acct = await queryAccount(kp.address, config).catch(() => null);
      return !!acct && (acct.amount as number) > 0;
    },
    { errorMessage: "fresh key's funded balance to appear" },
  );
  return { address: kp.address, privateKeyHex: kp.privateKeyHex };
}

describe('E2E DEX Liquidity Tests', () => {
  beforeAll(() => {
    config = getE2eConfig();
  });

  it("deposit queues into the committee's next dex batch", async () => {
    await bootstrapLiquidityPool();
    const depositor = await fundFreshKey();
    const before = (await queryAccount(depositor.address, config)).amount as number;

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'dexLiquidityDeposit',
        msg: { chainId: COMMITTEE_ID, amount: DEPOSIT_AMOUNT, address: depositor.address },
        // FeeParams' exact dex-fee keys weren't confirmed to exist on this
        // node version — sendFee is a safe stand-in; if this rejects with an
        // insufficient-fee error, check `fees({baseUrl})`'s live response for
        // a dexLiquidityDepositFee-shaped key and use that instead.
        fee: feeParams.sendFee ?? 10000,
        networkID: 1,
        chainID: 1,
        height,
      },
      depositor.privateKeyHex,
      derivePublicKey(depositor.privateKeyHex, CurveType.ED25519),
      CurveType.ED25519,
      { format: 'core' },
    );
    await submitTx(tx, { baseUrl: config.rpcUrl });

    await waitFor(
      async () => {
        const acct = await queryAccount(depositor.address, config);
        return (acct.amount as number) < before;
      },
      { errorMessage: 'depositor balance to decrease' },
    );

    const holding: any = await pool(COMMITTEE_ID, { baseUrl: config.rpcUrl, poolType: 'holding' });
    const batch: any = await nextDexBatch(COMMITTEE_ID, { baseUrl: config.rpcUrl });

    expect(holding.amount).toBe(DEPOSIT_AMOUNT);
    expect(batch.deposits).toHaveLength(1);
    expect(batch.deposits[0].amount).toBe(DEPOSIT_AMOUNT);
    expect(batch.deposits[0].address).toBe(depositor.address);
  });

  it('withdraw is rejected without settled liquidity points', async () => {
    await bootstrapLiquidityPool();

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'dexLiquidityWithdraw',
        msg: { chainId: COMMITTEE_ID, percent: 10, address: DEVNET_ADDRESS },
        fee: feeParams.sendFee ?? 10000,
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

    await waitFor(
      async () => {
        const page: any = await failedTxs(DEVNET_ADDRESS, { baseUrl: config.rpcUrl });
        return !!(page.results as any[]).find((f) => f.txHash === txHash);
      },
      { errorMessage: 'withdraw tx to show up in failed-txs', timeoutMs: 60_000 },
    );

    const page: any = await failedTxs(DEVNET_ADDRESS, { baseUrl: config.rpcUrl });
    const failure = (page.results as any[]).find((f) => f.txHash === txHash);
    // failedTxs' error field is the node's structured ErrorI, not a bare string.
    expect(failure.error.msg).toBe('point holder not found');
  });
});
