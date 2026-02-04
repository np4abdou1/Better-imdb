/**
 * GitHub Copilot Client
 * Integrated version of copilot-api logic for embedded use in Next.js
 * Handles token management and chat completions
 */

import { randomUUID } from 'crypto';

// State management (singleton - cache for warm lambdas)
const state = {
  githubToken: null,
  copilotToken: null,
  copilotTokenExpiresAt: null,
  accountType: 'individual', 
  vsCodeVersion: '1.95.3',
  isInitialized: false
};

// Constants
const COPILOT_VERSION = '0.26.7';
const EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`;
const USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`;
const API_VERSION = '2025-04-01';
const GITHUB_API_BASE_URL = 'https://api.github.com';

/**
 * Check if GitHub token is available (without initializing)
 */
export function hasGitHubToken(githubToken = null) {
  return !!(githubToken || state.githubToken || process.env.GITHUB_TOKEN);
}

/**
 * Get GitHub token status
 */
export function getTokenStatus() {
  return {
    available: !!state.githubToken || !!state.copilotToken || !!process.env.GITHUB_TOKEN,
    initialized: state.isInitialized,
    expiresAt: state.copilotTokenExpiresAt,
  };
}

/**
 * Get Copilot base URL based on account type
 */
function getCopilotBaseUrl() {
  return state.accountType === 'individual' 
    ? 'https://api.githubcopilot.com'
    : `https://api.${state.accountType}.githubcopilot.com`;
}

/**
 * Generate GitHub API headers
 */
function getGitHubHeaders() {
  return {
    'content-type': 'application/json',
    'accept': 'application/json',
    'authorization': `token ${state.githubToken}`,
    'editor-version': `vscode/${state.vsCodeVersion}`,
    'editor-plugin-version': EDITOR_PLUGIN_VERSION,
    'user-agent': USER_AGENT,
    'x-github-api-version': API_VERSION,
    'x-vscode-user-agent-library-version': 'electron-fetch'
  };
}

/**
 * Generate Copilot API headers
 */
function getCopilotHeaders(enableVision = false) {
  const headers = {
    'authorization': `Bearer ${state.copilotToken}`,
    'content-type': 'application/json',
    'copilot-integration-id': 'vscode-chat',
    'editor-version': `vscode/${state.vsCodeVersion}`,
    'editor-plugin-version': EDITOR_PLUGIN_VERSION,
    'user-agent': USER_AGENT,
    'openai-intent': 'conversation-panel',
    'x-github-api-version': API_VERSION,
    'x-request-id': randomUUID(),
    'x-vscode-user-agent-library-version': 'electron-fetch'
  };

  if (enableVision) {
    headers['copilot-vision-request'] = 'true';
  }

  return headers;
}

/**
 * Fetch Copilot token from GitHub API
 */
async function fetchCopilotToken() {
  if (!state.githubToken) {
    throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
  }

  const response = await fetch(
    `${GITHUB_API_BASE_URL}/copilot_internal/v2/token`,
    { headers: getGitHubHeaders() }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Copilot token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    expiresAt: data.expires_at,
    refreshIn: data.refresh_in
  };
}

/**
 * Setup Copilot token with automatic refresh
 */
async function setupCopilotToken() {
  try {
    const { token, expiresAt } = await fetchCopilotToken();
    
    state.copilotToken = token;
    state.copilotTokenExpiresAt = expiresAt;
    
    console.log('[Copilot] Token fetched successfully, expires at:', new Date(expiresAt * 1000).toISOString());
  } catch (error) {
    console.error('[Copilot] Token setup failed:', error.message);
    throw error;
  }
}

/**
 * Initialize Copilot client
 * Must be called once on server startup or per-request in serverless
 */
export async function initializeCopilot(githubToken = null) {
  // If we have a valid token in memory and it's for the SAME github token, skip fetch
  const now = Math.floor(Date.now() / 1000);
  const isTokenValid = state.copilotToken && state.copilotTokenExpiresAt > (now + 120);

  // If we are initialized with the token we want, just return
  if (isTokenValid && githubToken && state.githubToken === githubToken) {
    return;
  }

  // If no token provided but we have a valid one from ENV, return
  if (isTokenValid && !githubToken && state.githubToken === process.env.GITHUB_TOKEN) {
    return;
  }

  // If a new token is provided, we MUST re-initialize
  if (githubToken && state.githubToken !== githubToken) {
    state.githubToken = githubToken;
    state.copilotToken = null;
    state.isInitialized = false;
  }

  // Get GitHub token from parameter or environment
  const targetToken = githubToken || process.env.GITHUB_TOKEN;
  
  if (!targetToken) {
    console.warn('[Copilot] GITHUB_TOKEN not configured');
    state.isInitialized = false;
    state.copilotToken = null;
    return;
  }

  state.githubToken = targetToken;
  console.log('[Copilot] Initializing client...');
  try {
    await setupCopilotToken();
    state.isInitialized = true;
    console.log('[Copilot] Client initialized successfully');
  } catch (error) {
    console.error('[Copilot] Internal initialization error:', error.message);
    state.isInitialized = false;
    state.copilotToken = null;
    throw new Error(`Copilot initialization failed: ${error.message}. Your GITHUB_TOKEN might be invalid or expired.`);
  }
}

/**
 * Ensure Copilot is initialized before making requests
 */
async function ensureInitialized(githubToken = null) {
  const now = Math.floor(Date.now() / 1000);
  const needsInit = !state.isInitialized || !state.copilotToken || state.copilotTokenExpiresAt < (now + 120);
  
  if (needsInit || githubToken) {
    try {
      await initializeCopilot(githubToken);
    } catch (e) {
      // Re-throw the descriptive error from initializeCopilot
      throw e;
    }
  }
  
  if (!state.copilotToken) {
    throw new Error('Copilot access denied. Please re-authenticate in the chat interface.');
  }
}

/**
 * Create chat completions (streaming)
 * Returns a fetch Response object with streaming body
 */
export async function createChatCompletions(payload, githubToken = null) {
  await ensureInitialized(githubToken);

  // Check if vision is enabled (image_url content parts)
  const enableVision = payload.messages?.some(
    (msg) =>
      typeof msg.content !== 'string' &&
      Array.isArray(msg.content) &&
      msg.content.some((part) => part.type === 'image_url')
  );

  // Determine X-Initiator header (agent vs user)
  const isAgentCall = payload.messages?.some((msg) =>
    ['assistant', 'tool'].includes(msg.role)
  );

  const headers = {
    ...getCopilotHeaders(enableVision),
    'X-Initiator': isAgentCall ? 'agent' : 'user'
  };

  const response = await fetch(
    `${getCopilotBaseUrl()}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Copilot] Chat completions failed:', response.status, errorText);
    throw new Error(`Copilot API error: ${response.status} - ${errorText}`);
  }

  return response;
}

/**
 * Get available models from Copilot
 */
export async function getModels(githubToken = null) {
  await ensureInitialized(githubToken);

  const response = await fetch(
    `${getCopilotBaseUrl()}/models`,
    { headers: getCopilotHeaders() }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get models: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Get current state (for debugging)
 */
export function getCopilotState() {
  return {
    isInitialized: state.isInitialized,
    hasToken: !!state.copilotToken,
    tokenExpiresAt: state.copilotTokenExpiresAt,
    accountType: state.accountType
  };
}

/**
 * Cleanup on shutdown
 */
export function shutdownCopilot() {
  state.isInitialized = false;
  state.copilotToken = null;
  console.log('[Copilot] Client shutdown');
}

// Auto-initialize on import (lazy, on first use)
// In production, you may want to call initializeCopilot() explicitly in middleware
