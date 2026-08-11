/**
 * Vitest global setup/teardown for e2e tests.
 *
 * Manages the Docker lifecycle for the e2e devnet:
 * - Before tests: Wipes runtime state, builds, and starts the container
 * - During tests: Provides RPC_URL and ADMIN_RPC_URL environment variables
 * - After tests: Tears down the container
 *
 * Runtime state is wiped before every session starts so tests always run against
 * a clean genesis rather than whatever a previous invocation's chain happened to
 * leave behind -- balances, pending dex batches, staked validators, etc. would
 * otherwise silently accumulate across runs.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const E2E_DIR = path.dirname(__filename);
const DEVNET_DIR = path.join(E2E_DIR, 'devnet');
const COMPOSE_FILE = path.join(E2E_DIR, 'docker-compose.yaml');

const RPC_PORT = parseInt(process.env.E2E_RPC_PORT || '51004');
const ADMIN_PORT = parseInt(process.env.E2E_ADMIN_PORT || '51005');
const RPC_URL = `http://localhost:${RPC_PORT}`;
const ADMIN_RPC_URL = `http://localhost:${ADMIN_PORT}`;

const STARTUP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

// Runtime state entries that should be wiped before each session
const RUNTIME_STATE_ENTRIES = ['canopy', 'logs', 'book.json', 'polls.json', 'proposals.json'];

function compose(...args: string[]): Buffer {
  return execSync(`docker compose -f "${COMPOSE_FILE}" ${args.join(' ')}`, {
    cwd: E2E_DIR,
    encoding: 'utf-8',
  } as any) as any;
}

function wipeRuntimeState(): void {
  // Find which runtime state entries actually exist
  const targets = RUNTIME_STATE_ENTRIES
    .filter((name) => fs.existsSync(path.join(DEVNET_DIR, name)))
    .map((name) => `/data/${name}`);

  if (targets.length === 0) {
    return; // Nothing to wipe
  }

  // Use a throwaway container with the same bind mount to remove the files
  // (the node runs as root inside the container, so these files are root-owned
  // on the host and can't be removed directly)
  execSync(
    `docker run --rm -v "${DEVNET_DIR}:/data" alpine sh -c "rm -rf ${targets.join(' ')}"`,
    { encoding: 'utf-8' },
  );
}

async function waitForHeight(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${RPC_URL}/v1/query/height`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        timeout: 3_000,
      });

      if (response.ok) {
        const data = (await response.json()) as Record<string, any>;
        if (typeof data.height === 'number') {
          return; // Container is ready
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `canopy-e2e-node did not answer /v1/query/height within ${timeoutMs}ms: ${lastError?.message}`,
  );
}

export async function setup(): Promise<void> {
  console.log('E2E Setup: Checking for Docker...');
  try {
    execSync('docker --version', { encoding: 'utf-8' });
  } catch {
    throw new Error('Docker is not available — e2e tests require Docker');
  }

  console.log('E2E Setup: Wiping runtime state from previous runs...');
  wipeRuntimeState();

  console.log('E2E Setup: Starting Docker container...');
  try {
    compose('up', '-d', '--build');
  } catch (e) {
    throw new Error(`Failed to start e2e canopy node: ${e}`);
  }

  console.log('E2E Setup: Waiting for container to be ready...');
  try {
    await waitForHeight(STARTUP_TIMEOUT_MS);
  } catch (e) {
    // Fetch logs for debugging
    let logs = '';
    try {
      logs = compose('logs', '--tail=100');
    } catch {
      logs = '(failed to fetch logs)';
    }

    // Tear down the container since it failed to start
    try {
      compose('down');
    } catch {
      // Ignore errors during cleanup
    }

    throw new Error(`${e}\n--- container logs ---\n${logs}`);
  }

  console.log(`E2E Setup: Container ready! RPC: ${RPC_URL}, Admin RPC: ${ADMIN_RPC_URL}`);

  // Store URLs in environment for tests to access
  process.env.E2E_RPC_URL = RPC_URL;
  process.env.E2E_ADMIN_RPC_URL = ADMIN_RPC_URL;
}

export async function teardown(): Promise<void> {
  console.log('E2E Teardown: Stopping Docker container...');
  try {
    compose('down');
  } catch (e) {
    console.error(`Failed to stop e2e canopy node: ${e}`);
  }
}
