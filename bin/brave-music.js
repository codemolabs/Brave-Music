#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure operating system is Linux as specified
if (process.platform !== 'linux') {
  console.error('\n[Brave Music] Error: Currently this npm package is only supported on Linux.');
  console.error('For more information, visit: https://github.com/codemolabs/Brave-Music\n');
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

const childEnv = {
  ...process.env,
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
};
delete childEnv.ELECTRON_RUN_AS_NODE;

const args = [appRoot, '--no-sandbox', '--no-zygote', '--disable-gpu-sandbox', ...process.argv.slice(2)];
const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env: childEnv
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[Brave Music Launcher] Execution error:', err.message);
  process.exit(1);
});
