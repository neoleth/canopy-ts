#!/usr/bin/env node
/**
 * Postbuild: Copy WS proto files from the canonical location to dist/proto/
 *
 * This script copies .proto files from the plugin's game-server/ws-proto/ directory
 * into the SDK's dist/proto/ directory so they're available to frontends at:
 *   @canopynetwork/canopy-ts/proto/ws_frame.proto
 *   @canopynetwork/canopy-ts/proto/dice_ws.proto
 *   etc.
 */

const fs = require('fs');
const path = require('path');

const PROTO_FILES = [
  'ws_frame.proto',
  'dice_ws.proto',
  'plinko_ws.proto',
  'market_ws.proto',
  'account.proto'
];

// Try multiple locations for the canonical proto directory
const srcCandidates = [
  // From SDK repo (if it's a sibling)
  path.resolve(__dirname, '../../games/casino/game-server/ws-proto'),
  // From absolute SDK checkout
  path.resolve(__dirname, '../../../../canopy/games/casino/game-server/ws-proto'),
];

const distDir = path.resolve(__dirname, '../dist/proto');

// Find the source directory
let srcDir = null;
for (const candidate of srcCandidates) {
  if (fs.existsSync(candidate)) {
    srcDir = candidate;
    break;
  }
}

if (!srcDir) {
  console.warn('Warning: WS proto source directory not found. Proto files will not be copied.');
  console.warn('Expected one of:');
  srcCandidates.forEach(c => console.warn(`  - ${c}`));
  process.exit(0);
}

// Ensure dist/proto exists
fs.mkdirSync(distDir, { recursive: true });

// Copy each proto file
let copied = 0;
for (const file of PROTO_FILES) {
  const src = path.join(srcDir, file);
  const dst = path.join(distDir, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  copied: ${file}`);
    copied++;
  } else {
    console.warn(`  missing: ${file}`);
  }
}

if (copied > 0) {
  console.log(`Published ${copied}/${PROTO_FILES.length} WS protos to dist/proto/`);
} else {
  console.warn(`Warning: No proto files were copied.`);
  process.exit(1);
}
