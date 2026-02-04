#!/usr/bin/env node

/**
 * GitHub Device Code Authentication CLI
 * Allows users to authenticate without manually creating Personal Access Tokens
 * 
 * Usage: npm run auth
 */

import { getDeviceCode, pollAccessToken, getGitHubUser } from '../lib/github-auth.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function readEnvFile() {
  try {
    return await fs.readFile(envPath, 'utf8');
  } catch {
    return '';
  }
}

async function writeEnvFile(content) {
  await fs.writeFile(envPath, content, 'utf8');
}

function updateEnvVar(envContent, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  
  if (regex.test(envContent)) {
    // Update existing variable
    return envContent.replace(regex, `${key}=${value}`);
  } else {
    // Add new variable
    return envContent + `\n${key}=${value}\n`;
  }
}

async function main() {
  log('🔐 GitHub Authentication', 'cyan');
  log('=======================\n', 'cyan');

  try {
    log('📱 Getting device code...', 'bright');
    const deviceCodeResponse = await getDeviceCode();

    const deviceCode = deviceCodeResponse.device_code;
    const userCode = deviceCodeResponse.user_code;
    const verificationUri = deviceCodeResponse.verification_uri;
    const expiresIn = deviceCodeResponse.expires_in || 900;

    log(`\n✅ Code: ${userCode}\n`, 'green');
    log(`Visit: ${verificationUri}`, 'yellow');
    log(`Expires in: ${expiresIn}s\n`, 'bright');

    // Auto-open browser
    try {
      const os = await import('os');
      const { exec } = await import('child_process');
      
      if (os.platform() === 'darwin') {
        exec(`open "${verificationUri}"`);
      } else if (os.platform() === 'win32') {
        exec(`start ${verificationUri}`);
      } else {
        exec(`xdg-open "${verificationUri}"`);
      }
      
      log('Opening browser...\n', 'green');
    } catch {}

    log('⏳ Waiting...', 'bright');

    const pollInterval = setInterval(() => {
      process.stdout.write('.');
    }, 1000);

    const accessToken = await pollAccessToken(deviceCode);
    clearInterval(pollInterval);

    log('\n\n✅ Success!\n', 'green');

    log('👤 Getting user info...', 'bright');
    const user = await getGitHubUser(accessToken);
    log(`Logged in as: ${user.login}\n`, 'green');

    log('💾 Saving token...', 'bright');
    const envContent = await readEnvFile();
    const updatedEnv = updateEnvVar(envContent, 'GITHUB_TOKEN', accessToken);
    await writeEnvFile(updatedEnv);

    log('✅ Done!\n', 'green');
    log('Run: npm run dev', 'yellow');

  } catch (error) {
    log(`\n❌ Failed: ${error.message}\n`, 'red');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}\n`, 'red');
  process.exit(1);
});
