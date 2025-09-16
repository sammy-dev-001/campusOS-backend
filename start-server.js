#!/usr/bin/env node
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Start PM2 with the ecosystem config
const pm2 = exec(`npx pm2 start ${path.join(__dirname, 'ecosystem.config.js')} --no-daemon`, {
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    NODE_OPTIONS: '--max_old_space_size=1024',
  },
  stdio: 'inherit'
});

// Log PM2 output
pm2.stdout?.on('data', (data) => {
  console.log(`PM2: ${data}`);
});

pm2.stderr?.on('data', (data) => {
  console.error(`PM2 Error: ${data}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down PM2...');
  exec('npx pm2 delete all');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down PM2...');
  exec('npx pm2 delete all');
  process.exit(0);
});
