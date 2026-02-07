import { updateUserCopilotToken } from '@/lib/db';

export const GITHUB_BASE_URL = "https://github.com";
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export const GITHUB_APP_SCOPES = ["read:user"].join(" ");

export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
});

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DeviceParams {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token?: string;
  error?: string;
  token_type?: string;
  scope?: string;
}

export interface CheckTokenResponse {
  status: 'pending' | 'slow_down' | 'success' | 'unknown';
  token?: string;
}

/**
 * Get GitHub device code
 * Matches copilot-api/src/services/github/get-device-code.ts
 */
export async function getDeviceCode(): Promise<DeviceParams> {
  const response = await fetch(`${GITHUB_BASE_URL}/login/device/code`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_APP_SCOPES,
    }),
  });

  if (!response.ok) {
    const text = await response.text(); 
    throw new Error(`Failed to get device code: ${text}`);
  }

  return response.json() as Promise<DeviceParams>;
}

/**
 * Poll for access token (Blocking Loop)
 * @param deviceCode - The device_code string
 * @param interval - The interval in seconds
 */
export async function pollForToken(deviceCode: string, interval: number): Promise<string | null> {
  // Interval is in seconds, we need to multiply by 1000 to get milliseconds
  // I'm also adding another second, just to be safe
  const sleepDuration = (interval + 1) * 1000;
  console.log(`Polling access token with interval of ${sleepDuration}ms`);

  while (true) {
    const response = await fetch(
      `${GITHUB_BASE_URL}/login/oauth/access_token`,
      {
        method: "POST",
        headers: standardHeaders(),
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      },
    );

    if (!response.ok) {
      await sleep(sleepDuration);
      console.error("Failed to poll access token:", await response.text());
      continue;
    }

    const json = await response.json() as TokenResponse;
    console.debug("Polling access token response:", json);

    const { access_token, error } = json;

    if (access_token) {
      return access_token;
    } else if (error === 'authorization_pending') {
      await sleep(sleepDuration);
    } else if (error === 'slow_down') {
      await sleep(sleepDuration + 2000);
    } else if (error === 'expired_token') {
      return null;
    } else if (error === 'access_denied') {
      return null;
    } else {
      // Unknown error or state, wait and retry
      await sleep(sleepDuration);
    }
  }
}

/**
 * Legacy wrapper for compatibility if needed, or for passing the full object.
 * Supports both DeviceParams object (new) and string (legacy/script).
 * 
 * @deprecated Use pollForToken instead
 */
export async function pollAccessToken(deviceCode: DeviceParams | string): Promise<string | null> {
    if (typeof deviceCode === 'string') {
        // Legacy support: passed just the code string, default interval to 5s
        return pollForToken(deviceCode, 5);
    }
    return pollForToken(deviceCode.device_code, deviceCode.interval);
}

/**
 * Single check for access token (Non-blocking)
 * Needed for Next.js Route Handlers (Serverless) where long-polling is not possible.
 * Uses exact same headers/body structure as pollAccessToken loop body
 * @param {string} deviceCodeStr - The device_code string
 */
export async function checkAccessToken(deviceCodeStr: string): Promise<CheckTokenResponse> {
  const response = await fetch(
    `${GITHUB_BASE_URL}/login/oauth/access_token`,
    {
      method: "POST",
      headers: standardHeaders(),
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCodeStr,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as TokenResponse;

  if (data.error === 'authorization_pending') {
    return { status: 'pending' };
  }

  if (data.error === 'slow_down') {
    return { status: 'slow_down' };
  }

  if (data.error === 'access_denied') {
    throw new Error('Authorization denied');
  }

  if (data.error) {
    throw new Error(`Authorization failed: ${data.error}`);
  }

  if (data.access_token) {
    return { status: 'success', token: data.access_token };
  }

  return { status: 'unknown' };
}

/**
 * Get GitHub user info
 */
export async function getGitHubUser(token: string): Promise<any> {
  const response = await fetch(`https://api.github.com/user`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Save token to user in database
 */
export async function saveTokenToUser(userId: string, token: string): Promise<void> {
  await updateUserCopilotToken(userId, token);
}
