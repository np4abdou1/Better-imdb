
/**
 * GitHub Copilot Client
 * Integrated version of copilot-api logic for embedded use in Next.js
 * Handles token management and chat completions
 */

import { randomUUID } from 'crypto';
import { getUserById } from '@/lib/db';

export interface CopilotToken {
  token: string;
  expires_at: number;
  refresh_in: number;
}

export interface ChatCompletionContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ToolCall {
  index?: number;
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<ChatCompletionContentPart>;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  tools?: any[];
  tool_choice?: string | 'auto' | 'none';
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message?: ChatCompletionMessage;
  delta?: Partial<ChatCompletionMessage> & { tool_calls?: ToolCall[] };
  finish_reason: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionChunk extends Omit<ChatCompletionResponse, 'usage'> {
    // Usage might be null in chunks? Usually it's in the final chunk or omitted.
}

interface CopilotState {
  githubToken: string | null;
  copilotToken: string | null;
  copilotTokenExpiresAt: number | null;
  accountType: 'individual' | 'business' | 'enterprise';
  vsCodeVersion: string;
  isInitialized: boolean;
}

// State management (singleton - cache for warm lambdas)
const state: CopilotState = {
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
export function hasGitHubToken(githubToken: string | null = null): boolean {
  return !!(githubToken || state.githubToken || process.env.GITHUB_TOKEN);
}

/**
 * Get GitHub token status
 */
export function getTokenStatus() {
  return {
    available: !!state.githubToken || !!state.copilotToken || !!process.env.GITHUB_TOKEN,
    hasEnvToken: !!process.env.GITHUB_TOKEN,
    initialized: state.isInitialized,
    expiresAt: state.copilotTokenExpiresAt,
  };
}

/**
 * Get Copilot base URL based on account type
 */
function getCopilotBaseUrl(): string {
  return state.accountType === 'individual' 
    ? 'https://api.githubcopilot.com'
    : `https://api.${state.accountType}.githubcopilot.com`;
}

/**
 * Generate GitHub API headers
 */
function getGitHubHeaders(): Record<string, string> {
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
function getCopilotHeaders(enableVision = false): Record<string, string> {
  const headers: Record<string, string> = {
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
async function fetchCopilotToken(): Promise<{ token: string; expiresAt: number; refreshIn: number }> {
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

  const data: CopilotToken = await response.json();
  return {
    token: data.token,
    expiresAt: data.expires_at,
    refreshIn: data.refresh_in
  };
}

/**
 * Setup Copilot token with automatic refresh
 */
async function setupCopilotToken(): Promise<void> {
  try {
    const { token, expiresAt } = await fetchCopilotToken();
    
    state.copilotToken = token;
    state.copilotTokenExpiresAt = expiresAt;
    
    console.log('[Copilot] Token fetched successfully, expires at:', new Date(expiresAt * 1000).toISOString());
  } catch (error: any) {
    console.error('[Copilot] Token setup failed:', error.message);
    throw error;
  }
}

/**
 * Initialize Copilot client
 * Must be called once on server startup or per-request in serverless
 */
export async function initializeCopilot(githubToken: string | null = null): Promise<void> {
  // If we have a valid token in memory and it's for the SAME github token, skip fetch
  const now = Math.floor(Date.now() / 1000);
  const isTokenValid = state.copilotToken && state.copilotTokenExpiresAt && state.copilotTokenExpiresAt > (now + 120);

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
  } catch (error: any) {
    console.error('[Copilot] Internal initialization error:', error.message);
    state.isInitialized = false;
    state.copilotToken = null;
    throw new Error(`Copilot initialization failed: ${error.message}. Your GITHUB_TOKEN might be invalid or expired.`);
  }
}

/**
 * Ensure Copilot is initialized before making requests
 */
async function ensureInitialized(githubToken: string | null = null): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const needsInit = !state.isInitialized || !state.copilotToken || !state.copilotTokenExpiresAt || state.copilotTokenExpiresAt < (now + 120);
  
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
 * Get the current, valid Copilot token. Initializes if necessary.
 */
export async function getCopilotToken(userId?: string): Promise<string> {
    let githubToken: string | null = null;
    
    if (userId) {
        const user = await getUserById(userId);
        if (user?.copilot_token) {
            githubToken = user.copilot_token;
        }
    }

    // Attempt initialization/refresh
    await ensureInitialized(githubToken);

    if (!state.copilotToken) {
        throw new Error("Could not retrieve Copilot token");
    }

    return state.copilotToken;
}

/**
 * Create chat completions (raw response)
 * Returns a fetch Response object with streaming body
 */
export async function createChatCompletions(payload: ChatCompletionRequest, githubToken: string | null = null): Promise<Response> {
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
 * Helper to parse SSE events from the response stream
 */
export async function* streamChatCompletion(
  payload: ChatCompletionRequest,
  githubToken: string | null = null
): AsyncGenerator<ChatCompletionChunk> {
    const response = await createChatCompletions(payload, githubToken);
    
    if (!response.body) {
        throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep partial line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const dataStr = trimmed.slice(6);
                    const data: ChatCompletionChunk = JSON.parse(dataStr);
                    yield data;
                } catch (e) {
                    console.warn('[Copilot] Failed to parse SSE line:', trimmed, e);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Get available models from Copilot
 */
export async function getModels(githubToken: string | null = null) {
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
