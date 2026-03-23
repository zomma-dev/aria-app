#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

delete process.env.ELECTRON_RUN_AS_NODE;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const electronVitePkg = require.resolve('electron-vite/package.json');
const electronViteCli = path.join(
  path.dirname(electronVitePkg),
  'bin',
  'electron-vite.js',
);
const args = [electronViteCli, 'preview', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
