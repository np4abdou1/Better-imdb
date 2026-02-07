// Get available AI models from GitHub Copilot

import { NextResponse } from 'next/server';
import { getModels } from '@/lib/copilot-client';
import { auth } from '@/auth';
import { getUserById } from '@/lib/db';

// Fallback models (returned when token is unavailable)
const FALLBACK_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
];

export async function GET(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // Get GitHub Copilot token from DB for this user, or from cookies for guests
    let githubToken = null;
    if (userId) {
      const user = await getUserById(userId);
      if (user?.copilot_token) {
        githubToken = user.copilot_token;
      }
    }

    // Fallback to cookie if no DB token
    if (!githubToken) {
      const cookieStore = request.cookies;
      githubToken = cookieStore.get('github_token')?.value;
    }

    // If still no token, return fallback models
    if (!githubToken) {
       // Check if there is a server-side env token as last resort
       if (process.env.GITHUB_TOKEN) {
         githubToken = process.env.GITHUB_TOKEN;
       } else {
         return NextResponse.json(FALLBACK_MODELS);
       }
    }

    const data = await getModels(githubToken);
    
    // Transform models to expected format and deduplicate by model ID
    const seenIds = new Set();
    const models = Array.isArray(data?.data)
      ? data.data
          .filter(model => {
            if (seenIds.has(model.id)) {
              return false;
            }
            seenIds.add(model.id);
            return true;
          })
          .map(model => ({
            id: model.id,
            name: model.display_name || model.id.replace(/^gpt/i, 'GPT').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          }))
      : [];

    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching AI models:', error);
    // Fallback to basic models if Copilot is unavailable
    return NextResponse.json(FALLBACK_MODELS);
  }
}
