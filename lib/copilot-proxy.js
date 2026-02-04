// Automatic Copilot API Proxy Manager
// Starts copilot-api automatically when Next.js starts

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

let copilotProcess = null;
let isStarting = false;
let isReady = false;

const shouldLog = process.env.VERBOSE_AI === 'true';
const log = (...args) => {
  if (shouldLog) console.log(...args);
};
const logError = (...args) => {
  if (shouldLog) console.error(...args);
};

const COPILOT_PORT = 4141;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Check if copilot-api is already running
async function isProxyRunning() {
  try {
    const response = await fetch(`http://localhost:${COPILOT_PORT}/v1/models`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Start the copilot-api proxy
async function startProxy() {
  if (isStarting || isReady) return;
  isStarting = true;

  log('🚀 Starting Copilot API Proxy...');

  const copilotDir = join(process.cwd(), 'copilot-api');

  if (!existsSync(copilotDir)) {
    logError('❌ copilot-api directory not found');
    isStarting = false;
    return;
  }

  if (!GITHUB_TOKEN) {
    logError('❌ GITHUB_TOKEN not found in .env.local');
    isStarting = false;
    return;
  }

  // Check if already running
  if (await isProxyRunning()) {
    log('✅ Copilot API Proxy already running');
    isReady = true;
    isStarting = false;
    return;
  }

  // Spawn the copilot-api process
  copilotProcess = spawn(
    'bun',
    [
      'run',
      './src/main.ts',
      'start',
      '--github-token',
      GITHUB_TOKEN,
      '--port',
      COPILOT_PORT.toString()
    ],
    {
      cwd: copilotDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GH_TOKEN: GITHUB_TOKEN
      }
    }
  );

  copilotProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Server running')) {
      isReady = true;
      log('✅ Copilot API Proxy ready on port', COPILOT_PORT);
    }
    // Suppress verbose logs
    log('[Copilot API]', output.trim());
  });

  copilotProcess.stderr.on('data', (data) => {
    const error = data.toString();
    if (!error.includes('deprecated')) {
      logError('[Copilot API Error]', error.trim());
    }
  });

  copilotProcess.on('error', (error) => {
    logError('❌ Failed to start Copilot API:', error.message);
    isStarting = false;
    isReady = false;
  });

  copilotProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`⚠️ Copilot API exited with code ${code}`);
    }
    isStarting = false;
    isReady = false;
    copilotProcess = null;
  });

  // Wait for proxy to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (await isProxyRunning()) {
      isReady = true;
      isStarting = false;
      return;
    }
  }

  log('⚠️ Copilot API may not be ready yet');
  isStarting = false;
}

// Graceful shutdown
function stopProxy() {
  if (copilotProcess) {
    log('🛑 Stopping Copilot API Proxy...');
    copilotProcess.kill('SIGTERM');
    copilotProcess = null;
    isReady = false;
  }
}

// Handle process exits
process.on('exit', stopProxy);
process.on('SIGINT', () => {
  stopProxy();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopProxy();
  process.exit(0);
});

// Auto-start on import
if (process.env.NODE_ENV !== 'test') {
  startProxy();
}

export { startProxy, stopProxy, isProxyRunning, COPILOT_PORT };
