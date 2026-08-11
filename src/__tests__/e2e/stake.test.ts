/**
 * E2E tests for the validator staking lifecycle (stake/edit_stake/unstake,
 * including delegate staking) against a live single-node canopy devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAndSignTransaction } from '../../transaction.js';
import { derivePublicKey } from '../../signing.js';
import { deriveAddress } from '../../address.js';
import { CurveType } from '../../types.js';
import { generateKeyPair } from '../../wallet.js';
import { submitTx, validator, fees } from '../../rpc.js';
import { queryHeight, queryAccount, waitFor, getE2eConfig } from '../../../tests/e2e/helpers.js';

const DEVNET_ADDRESS = '3db4b1ec0d9206365696e0c3a52a519840060c86';
const DEVNET_PRIVATE_KEY_HEX = '58076499043ed850ddf6675da60e666124093d3c6933fcaf6b605f4141d30958';
const NON_ROOT_COMMITTEE = 2; // avoid committee 1 (root/consensus) — a second
// active validator there with no real peer can stall block production on a
// single-node devnet.
const ROOT_COMMITTEE = 1;
const FUND_AMOUNT = 2_000_000_000;
const STAKE_AMOUNT = 1_000_000_000;

let config: ReturnType<typeof getE2eConfig>;

/** Fund a freshly generated ed25519 account from the devnet genesis key. */
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
    { errorMessage: 'funded account balance to appear' },
  );

  return { address: kp.address, privateKeyHex: kp.privateKeyHex };
}

/** stake's public_key field is the validator's own BLS operator key — a
 * fresh ed25519 signing key funds and pays for the tx; the operator key is a
 * separate, freshly generated BLS key (matches canopy-mcp's e2e pattern). */
function freshBlsOperatorKeyHex(): { privateKeyHex: string; publicKeyHex: string } {
  // Rejection-sample: a uniformly random 32-byte scalar occasionally falls
  // outside bls12_381's valid range and derivePublicKey throws — retry with a
  // fresh draw rather than letting that rare draw fail the test.
  for (let attempt = 0; attempt < 10; attempt++) {
    const priv = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyHex = Array.from(priv, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      return { privateKeyHex, publicKeyHex: derivePublicKey(privateKeyHex, CurveType.BLS12381) };
    } catch {
      continue;
    }
  }
  throw new Error('freshBlsOperatorKeyHex: failed to derive a valid BLS12381 key after 10 attempts');
}

async function pollValidator(address: string, predicate: (v: any) => boolean) {
  return waitFor(
    async () => {
      const v = await validator(address, { baseUrl: config.rpcUrl }).catch(() => null);
      return v && predicate(v) ? true : false;
    },
    { errorMessage: `validator ${address} state predicate`, timeoutMs: 60_000 },
  ).then(() => validator(address, { baseUrl: config.rpcUrl }));
}

async function stakeFreshValidator(netAddress: string, committees: number[], delegate = false) {
  const funder = await fundFreshKey();
  const operatorKey = freshBlsOperatorKeyHex();
  // The validator is looked up by an address derived from its own BLS operator
  // public key — NOT by outputAddress (where rewards/unstaked funds land) and
  // NOT by the funder's signing address. Empirically confirmed against a live
  // devnet: querying by outputAddress returns "validator does not exist".
  const validatorAddress = deriveAddress(operatorKey.publicKeyHex, CurveType.BLS12381);
  const height = await queryHeight(config);
  const feeParams = await fees({ baseUrl: config.rpcUrl });

  const tx = createAndSignTransaction(
    {
      type: 'stake',
      msg: {
        publicKey: operatorKey.publicKeyHex,
        amount: STAKE_AMOUNT,
        committees,
        netAddress: delegate ? '' : netAddress,
        outputAddress: funder.address,
        delegate,
        compound: false,
      },
      fee: feeParams.stakeFee ?? 10000,
      networkID: 1,
      chainID: 1,
      height,
    },
    funder.privateKeyHex,
    derivePublicKey(funder.privateKeyHex, CurveType.ED25519),
    CurveType.ED25519,
    { format: 'core' },
  );
  await submitTx(tx, { baseUrl: config.rpcUrl });

  await pollValidator(validatorAddress, (v) => v.stakedAmount > 0);
  return { validatorAddress, funder, operatorKey };
}

describe('E2E Stake Tests', () => {
  beforeAll(() => {
    config = getE2eConfig();
  });

  it('stake registers a new validator on the node', async () => {
    const { validatorAddress, funder } = await stakeFreshValidator('tcp://stake-test-validator', [NON_ROOT_COMMITTEE]);
    const v = await validator(validatorAddress, { baseUrl: config.rpcUrl });
    expect(v.stakedAmount).toBe(STAKE_AMOUNT);
    expect(v.netAddress).toBe('tcp://stake-test-validator');
    expect(v.committees).toEqual([NON_ROOT_COMMITTEE]);
    expect(v.output).toBe(funder.address);
    expect(v.delegate ?? false).toBe(false);
  });

  it('delegate stake registers a passive delegate without stalling the chain', async () => {
    const h1 = await queryHeight(config);
    const { validatorAddress } = await stakeFreshValidator('tcp://should-be-ignored-for-a-delegate', [ROOT_COMMITTEE], true);
    const v = await validator(validatorAddress, { baseUrl: config.rpcUrl });

    expect(v.stakedAmount).toBe(STAKE_AMOUNT);
    expect(v.delegate).toBe(true);
    expect(v.netAddress).toBe(''); // server-forces empty for delegates
    expect(v.committees).toEqual([ROOT_COMMITTEE]);

    const h2 = await waitFor(
      async () => {
        const h = await queryHeight(config);
        return h > h1;
      },
      { errorMessage: 'height to advance past a delegate staking into the root committee' },
    ).then(() => queryHeight(config));
    expect(h2).toBeGreaterThan(h1);
  });

  it('editStake modifies an existing validator on the node', async () => {
    const { validatorAddress, funder } = await stakeFreshValidator('tcp://edit-stake-test-validator', [NON_ROOT_COMMITTEE]);
    const newAmount = STAKE_AMOUNT + 500_000_000;

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'editStake',
        msg: {
          address: validatorAddress,
          amount: newAmount,
          committees: [NON_ROOT_COMMITTEE],
          netAddress: 'tcp://edit-stake-test-validator-edited',
          outputAddress: funder.address,
          compound: false,
        },
        fee: feeParams.editStakeFee ?? 10000,
        networkID: 1,
        chainID: 1,
        height,
      },
      funder.privateKeyHex,
      derivePublicKey(funder.privateKeyHex, CurveType.ED25519),
      CurveType.ED25519,
      { format: 'core' },
    );
    await submitTx(tx, { baseUrl: config.rpcUrl });

    const v = await pollValidator(validatorAddress, (v) => v.stakedAmount === newAmount);
    expect(v.netAddress).toBe('tcp://edit-stake-test-validator-edited');
  });

  it('unstake begins unstaking an existing validator on the node', async () => {
    const { validatorAddress, funder } = await stakeFreshValidator('tcp://unstake-test-validator', [NON_ROOT_COMMITTEE]);

    const height = await queryHeight(config);
    const feeParams = await fees({ baseUrl: config.rpcUrl });
    const tx = createAndSignTransaction(
      {
        type: 'unstake',
        msg: { fromAddress: validatorAddress },
        fee: feeParams.unstakeFee ?? 10000,
        networkID: 1,
        chainID: 1,
        height,
      },
      funder.privateKeyHex,
      derivePublicKey(funder.privateKeyHex, CurveType.ED25519),
      CurveType.ED25519,
      { format: 'core' },
    );
    await submitTx(tx, { baseUrl: config.rpcUrl });

    const v = await pollValidator(validatorAddress, (v) => v.unstakingHeight > 0);
    expect(v.unstakingHeight).toBeGreaterThan(0);
  });
});
