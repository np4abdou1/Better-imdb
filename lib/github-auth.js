// lib/github-auth.js
// Implements GitHub Device Flow matching copilot-api reference logic

export const GITHUB_BASE_URL = "https://github.com";
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export const GITHUB_APP_SCOPES = ["read:user"].join(" ");

export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
});

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get GitHub device code
 * Matches copilot-api/src/services/github/get-device-code.ts
 */
export async function getDeviceCode() {
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

  return response.json();
}

/**
 * Poll for access token (Blocking Loop)
 * Matches copilot-api/src/services/github/poll-access-token.ts
 * NOTE: This will block until completion. Use checkAccessToken for non-blocking.
 * @param {object} deviceCode - The full response object from getDeviceCode
 */
export async function pollAccessToken(deviceCode) {
  // Interval is in seconds, we need to multiply by 1000 to get milliseconds
  // I'm also adding another second, just to be safe
  const sleepDuration = (deviceCode.interval + 1) * 1000;
  console.log(`Polling access token with interval of ${sleepDuration}ms`);

  while (true) {
    const response = await fetch(
      `${GITHUB_BASE_URL}/login/oauth/access_token`,
      {
        method: "POST",
        headers: standardHeaders(),
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      },
    );

    if (!response.ok) {
      await sleep(sleepDuration);
      console.error("Failed to poll access token:", await response.text());
      continue;
    }

    const json = await response.json();
    console.debug("Polling access token response:", json);

    const { access_token } = json;

    if (access_token) {
      return access_token;
    } else {
      await sleep(sleepDuration);
    }
  }
}

/**
 * Single check for access token (Non-blocking)
 * Needed for Next.js Route Handlers (Serverless) where long-polling is not possible.
 * Uses exact same headers/body structure as pollAccessToken loop body
 * @param {string} deviceCodeStr - The device_code string
 */
export async function checkAccessToken(deviceCodeStr) {
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

  const data = await response.json();

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
 * Legacy helper
 */
export async function getGitHubUser(token) {
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
