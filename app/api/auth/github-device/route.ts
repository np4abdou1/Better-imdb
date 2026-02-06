/**
 * GitHub Device Authentication API Route
 * Handles device code flow for browser-based authentication
 * Stores token in cookies and .env
 */

import { getDeviceCode, checkAccessToken, getGitHubUser } from '@/lib/github-auth';
import { initializeCopilot } from '@/lib/copilot-client';
import { auth } from '@/auth';
import { updateUserCopilotToken } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Step 1: Get device code
 * POST /api/auth/github-device/request
 */
export async function POST(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const { action, deviceCode } = body;

    if (action === 'request-code') {
      // Get device code from GitHub
      const response = await getDeviceCode();

      return NextResponse.json({
        success: true,
        deviceCode: response.device_code,
        userCode: response.user_code,
        verificationUri: response.verification_uri,
        expiresIn: response.expires_in || 900,
        interval: response.interval
      });
    }

    if (action === 'poll-token') {
      if (!deviceCode) {
        return NextResponse.json(
          { error: 'Device code required' },
          { status: 400 }
        );
      }

      console.log(`[GitHub Auth] Checking token for device code: ${deviceCode.substring(0, 8)}...`);

      // Check for token (Non-blocking check)
      const result = await checkAccessToken(deviceCode);

      if (result.status === 'pending' || result.status === 'slow_down') {
        console.log(`[GitHub Auth] Result: ${result.status}`);
        return NextResponse.json({
          success: false,
          pending: true,
          status: result.status
        });
      }

      console.log(`[GitHub Auth] Successfully acquired token!`);
      const token = result.token;
      // Verify token works
      const user = await getGitHubUser(token);
      console.log(`[GitHub Auth] User authenticated: ${user.login}`);

      // 1. Save to Database for this user if logged in
      if (userId) {
        console.log(`[GitHub Auth] Saving token to database for user ${userId}`);
        updateUserCopilotToken(userId, token);
      }

      // 2. Initialize Copilot client with new token immediately
      try {
        console.log(`[GitHub Auth] Re-initializing Copilot client...`);
        await initializeCopilot(token);
      } catch (e) {
        console.error('[GitHub Auth] Failed to initialize Copilot with new token:', e.message);
      }

      // Return token in response and set cookie
      const response = NextResponse.json({
        success: true,
        token,
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url
        }
      });

      // Set secure cookie - MUST set path to / to be available across all routes
      response.cookies.set('github_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Use lax to allow redirected access
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[GitHub Auth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 400 } // Use 400 for errors like access_denied
    );
  }
}
