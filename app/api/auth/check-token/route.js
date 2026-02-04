import { NextResponse } from 'next/server';
import { getTokenStatus } from '@/lib/copilot-client';

export const dynamic = 'force-dynamic';

/**
 * Check if GitHub token is available
 * Used by frontend to determine if auth modal should show
 * Never throws - always returns valid response
 */
export async function GET(request) {
  const tokenStatus = getTokenStatus();
  
  // Check cookies for token (from browser auth)
  const cookies = request.cookies;
  const hasCookieToken = !!cookies.get('github_token')?.value;

  const isAvailable = tokenStatus.hasEnvToken || tokenStatus.available || hasCookieToken;

  return NextResponse.json({
    available: isAvailable,
    hasEnvToken: tokenStatus.hasEnvToken,
    hasStateToken: tokenStatus.available,
    hasCookieToken: hasCookieToken,
    initialized: tokenStatus.initialized,
    expiresAt: tokenStatus.expiresAt
  });
}
