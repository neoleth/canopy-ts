# E2E Testing Guide for canopy-ts

This document explains how to run the end-to-end (e2e) test suite for canopy-ts against a live single-node canopy devnet.

## Overview

The e2e tests hit an actual running canopy node over HTTP — no mocked RPC responses. They exist to catch the class of bug unit tests structurally cannot:
- Wire-format mismatches between the TypeScript SDK and the Go node
- Wrong RPC paths or endpoint names
- Whether signed transactions actually work end-to-end

The test suite:
- Automatically manages a Docker container for the devnet (brings it up, runs tests, tears it down)
- Wipes runtime state before each session so tests run against a clean genesis
- Provides shared helpers for common operations (transaction submission, polling, etc.)

## Prerequisites

1. **Docker**: The e2e tests require Docker to run a single-node canopy devnet. Install Docker if you haven't already.

2. **Canopy source code**: The Docker image builds the canopy node from source. You need a local checkout of the canopy-network/canopy repository:
   ```bash
   cd ~/canopy
   git clone https://github.com/canopy-network/canopy.git canopy-main
   ```

3. **Node.js and npm**: canopy-ts requires Node.js 18+ and npm (or yarn/pnpm).

## Running the E2E Tests

### Run all e2e tests:

```bash
npm run test:e2e
```

This will:
1. Wipe any leftover runtime state from previous runs
2. Build and start the Docker container with the canopy node
3. Wait for the node to be ready (health check on RPC endpoint)
4. Run all e2e tests in serial
5. Tear down the container

### Run a specific e2e test file:

```bash
npm run test:e2e -- src/__tests__/e2e/smoke.test.ts
```

### Run a specific test:

```bash
npm run test:e2e -- --grep "height increases"
```

### Run with debug output:

```bash
DEBUG=* npm run test:e2e
```

## Environment Variables

- `E2E_RPC_PORT` (default: 51002): Local port to bind the node's public RPC endpoint
- `E2E_ADMIN_PORT` (default: 51003): Local port to bind the node's admin RPC endpoint
- `CANOPY_SRC_PATH` (default: `../../../canopy/main`): Path to the canopy-network/canopy checkout (relative to the docker-compose.yaml directory)

Example:
```bash
CANOPY_SRC_PATH=/path/to/canopy/main E2E_RPC_PORT=52000 npm run test:e2e
```

## Test Structure

### Global Setup/Teardown

The file `tests/e2e/global-setup.ts` handles Docker lifecycle:
- **setup()**: Called before any e2e tests run
  - Checks Docker availability
  - Wipes runtime state (canopy blocks, logs, dex queues)
  - Builds and starts the container
  - Waits for the node to respond to RPC queries

- **teardown()**: Called after all e2e tests complete
  - Stops and removes the container

### Test Helpers

The file `tests/e2e/helpers.ts` provides utilities for e2e tests:

#### Configuration
- `getE2eConfig()`: Get RPC URLs from environment or defaults
- `E2eConfig`: Configuration object with rpcUrl and adminRpcUrl

#### RPC Requests
- `rpcRequest<T>(path, body, config)`: Make a JSON RPC POST request
- `queryHeight(config)`: Get the current block height
- `queryAccount(address, config)`: Get account balance and details
- `submitTx(tx, config)`: Submit a signed transaction (uses the actual `submitTx` from rpc.ts)

#### Polling and Waiting
- `waitFor(condition, opts)`: Poll a condition function until true or timeout
  - Options: `timeoutMs` (default 30s), `intervalMs` (default 1s), `errorMessage`
- `extractTxHash(response)`: Extract transaction hash from submitTx response

#### Transaction Submission
- `devnetTx(submitFn, opts)`: Submit a transaction and extract the hash
  - Returns the transaction hash
  - Can be extended to wait for confirmation if needed

### Test Files

#### smoke.test.ts
Basic sanity checks:
- `height increases`: Verify block height advances
- `genesis account is funded`: Verify the devnet genesis account has a balance
- `real signed send is accepted by the node`: Full end-to-end send transaction

#### stake.test.ts (placeholder)
Validator staking lifecycle tests (pending keystore management):
- `stake registers a new validator on the node`
- `delegate stake registers a passive delegate on the node`
- `edit stake modifies an existing validator on the node`
- `unstake begins unstaking an existing validator on the node`

#### subsidize.test.ts (placeholder)
Committee subsidization tests (pending keystore management):
- `subsidize adds funds to the committee pool on the node`

#### dex-orders.test.ts (placeholder)
DEX order transaction tests (pending keystore management):
- `create order creates an order on the dex`
- `edit order modifies an existing order on the dex`
- `delete order cancels an order on the dex`

#### dex-liquidity.test.ts (placeholder)
DEX liquidity provisioning tests (pending keystore management):
- `deposit adds liquidity to a pool on the dex`
- `withdraw removes liquidity from a pool on the dex`

## Docker Devnet Setup

### Configuration Files

The devnet configuration is stored in `tests/e2e/devnet/` (copied from canopy-mcp):

- `config.json`: Node configuration (endpoints, timeouts, etc.)
- `genesis.json`: Genesis block state (accounts, validators, initial parameters)
- `validator_key.json`: Private key for the single validator node
- `canopy-node.Dockerfile`: Minimal Dockerfile to build the canopy node binary

The runtime state directories created during testing are automatically wiped:
- `canopy/`: Block data and ledger state
- `logs/`: Node logs
- `book.json`, `polls.json`, `proposals.json`: DEX and governance state queues

### Genesis Account

The devnet is seeded with a single genesis account for testing:
- **Address**: `3db4b1ec0d9206365696e0c3a52a519840060c86`
- **Private Key** (hex): `58076499043ed850ddf6675da60e666124093d3c6933fcaf6b605f4141d30958`
- **Balance**: Pre-funded in genesis (see `tests/e2e/devnet/genesis.json`)

## Implementation Notes

### Completed Features
1. ✅ Task 1: Fixed submitTx to return raw response body for tx hash extraction
2. ✅ Task 2: Copied devnet fixtures and Dockerfile from canopy-mcp
3. ✅ Task 3: Set up Vitest e2e config and Docker lifecycle management
4. ✅ Task 4: Created shared e2e helpers (devnetTx, waitFor, extractTxHash)
5. ✅ Task 5-9: Ported 5 e2e test suites (smoke, stake, subsidize, dex-orders, dex-liquidity)
6. ✅ Task 10: Wrap-up and documentation

### Pending Implementation

The following tests are currently placeholders (`.skip()`) pending additional infrastructure:

- **Stake tests**: Require keystore management for newly generated validator keys during tests
- **Subsidize tests**: Require subsidize transaction builder
- **DEX order tests**: Require DEX order transaction builders (create/edit/delete)
- **DEX liquidity tests**: Require DEX liquidity transaction builders (deposit/withdraw)

These tests can be implemented once:
1. A keystore management system is added to canopy-ts (for storing and retrieving generated keys)
2. Transaction builders for all core and plugin message types are complete
3. The necessary helpers are ported from canopy-mcp

## Troubleshooting

### "Docker is not available"
Make sure Docker is installed and running:
```bash
docker --version
docker ps
```

### "Failed to start e2e canopy node"
Check that:
1. Docker has enough disk space
2. The ports (default 51002, 51003) are not in use:
   ```bash
   lsof -i :51002
   lsof -i :51003
   ```
3. The CANOPY_SRC_PATH points to a valid canopy-network/canopy checkout

### "Timeout waiting for canopy node"
The node might be taking longer than expected to start. Try:
1. Check container logs: `docker logs canopy-e2e-node`
2. Increase timeout: `E2E_STARTUP_TIMEOUT_MS=180000 npm run test:e2e`
3. Verify the build succeeded: `docker build -f tests/e2e/canopy-node.Dockerfile ../../../canopy/main`

### Container won't stop
If the Docker container doesn't stop cleanly:
```bash
docker stop canopy-e2e-node
docker rm canopy-e2e-node
```

## Architecture Diagram

```
                         ┌─────────────────────────┐
                         │   vitest runner         │
                         │ (vitest.config.e2e.ts)  │
                         └────────────┬────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
            ┌───────▼────────┐              ┌───────────▼──────┐
            │ global-setup   │              │  e2e test files  │
            │  (Docker)      │              │  (src/__tests__/  │
            └────────────────┘              │   e2e/*.test.ts) │
                    │                       └──────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼────┐           ┌────▼────┐
    │ setup() │           │teardown()│
    │         │           │          │
    │ • Wipe  │           │ • Stop   │
    │   state │           │   devnet │
    │ • Build │           │ • Clean  │
    │   image │           │   up     │
    │ • Start │           │          │
    │   devnet│           └──────────┘
    │ • Wait  │
    │   for   │
    │   RPC   │
    └────┬────┘
         │
    ┌────▼──────────────────────────────┐
    │   Docker Container                 │
    │   ┌─────────────────────────────┐  │
    │   │  canopy-network/canopy node │  │
    │   │                             │  │
    │   │ • Port 50002 (public RPC)   │  │
    │   │ • Port 50003 (admin RPC)    │  │
    │   │ • Volume: ./devnet          │  │
    │   └─────────────────────────────┘  │
    └────────────────────────────────────┘
         ▲
         │ RPC calls
         │
    ┌────┴────────────────────┐
    │  Test Helpers           │
    │ (tests/e2e/helpers.ts)  │
    │                         │
    │ • getE2eConfig()        │
    │ • queryHeight()         │
    │ • queryAccount()        │
    │ • rpcRequest()          │
    │ • submitTx()            │
    │ • waitFor()             │
    │ • extractTxHash()       │
    └─────────────────────────┘
```

## Contributing

When adding new e2e tests:

1. Create a new test file in `src/__tests__/e2e/`
2. Import helpers from `tests/e2e/helpers.ts`
3. Use `getE2eConfig()` to get RPC URLs
4. Use `queryHeight()`, `queryAccount()`, etc. for node queries
5. Use `submitTx()` to submit transactions
6. Use `waitFor()` to poll for conditions
7. Follow the pattern in `smoke.test.ts` for full end-to-end tests

## See Also

- [canopy-mcp E2E Tests](../canopy-mcp/tests/e2e/) — Python implementation these tests were ported from
- [Vitest Documentation](https://vitest.dev/) — Testing framework used
- [canopy-ts SDK Documentation](./README.md) — Main SDK docs
