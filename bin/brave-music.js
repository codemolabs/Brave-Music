#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure operating system is Linux as specified
if (process.platform !== 'linux') {
  console.error('\n[Brave Music] Error: Currently this npm package is only supported on Linux.');
  console.error('Windows native packages (.exe and .zip) are available at:');
  console.error('https://github.com/codemolabs/Brave-Music/releases\n');
  process.exit(1);
}

const appRoot = path.join(__dirname, '..');
let electronBin = null;

const candidateElectron = [
  path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron'),
  path.join(appRoot, 'node_modules', '.bin', 'electron'),
  '/opt/brave-music/node_modules/.bin/electron'
];

for (const p of candidateElectron) {
  if (fs.existsSync(p)) {
    electronBin = p;
    break;
  }
}

if (!electronBin) {
  try {
    electronBin = require('electron');
  } catch (e) {
    electronBin = 'electron';
  }
}

const args = [appRoot, '--no-sandbox', '--in-process-gpu', ...process.argv.slice(2)];
const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[Brave Music Launcher] Execution error:', err.message);
  process.exit(1);
});
