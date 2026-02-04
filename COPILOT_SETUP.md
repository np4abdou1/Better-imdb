# GitHub Copilot Integration Setup

Better IMDb now has **embedded GitHub Copilot support** - no separate service required!

## Quick Start

### 1. Get GitHub Token

You need a GitHub Personal Access Token with Copilot access:

1. Go to https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Name it: `Better-IMDb-Copilot`
4. Select scopes: **Check only `copilot`** (or `read:user` if copilot not visible)
5. Click **"Generate token"**
6. Copy the token (starts with `ghp_...`)

### 2. Add Token to Environment

Add to your `.env` file:

```bash
GITHUB_TOKEN=ghp_your_token_here
```

### 3. Run the App

```bash
npm run dev
```

The Copilot client initializes automatically on first AI chat request.

## How It Works

The integration includes:

- **`lib/copilot-client.js`** - Core Copilot client (token management, API calls)
- **`app/api/ai/chat/route.js`** - Streaming chat endpoint (tool calling support)
- **`app/api/ai/models/route.js`** - Available models endpoint

### Token Management

- Fetches Copilot token from GitHub API on startup
- Auto-refreshes 60 seconds before expiry
- Handles token caching in memory

### API Features

- **Streaming responses** - Real-time text generation
- **Tool calling** - Web search, list management, ratings
- **Vision support** - Image understanding (if available)
- **Auto-retry** - Token refresh on expiry

## Troubleshooting

### "GITHUB_TOKEN not configured"

Add `GITHUB_TOKEN` to `.env` file (see step 2 above).

### "Failed to get Copilot token"

**Possible causes:**
- Token doesn't have Copilot access (you need an active GitHub Copilot subscription)
- Token expired or revoked
- Network/firewall blocking GitHub API

**Solution:**
1. Check if you have Copilot: https://github.com/settings/copilot
2. Regenerate token with correct scopes
3. Verify token works: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user`

### "Copilot token expired"

The client auto-refreshes tokens. If this error persists:
- Restart the dev server
- Check GitHub API status: https://www.githubstatus.com/

## Architecture Changes

### Before (copilot-api service)
```
Next.js App → HTTP → copilot-api (port 4141) → GitHub Copilot
```

### After (embedded)
```
Next.js App → lib/copilot-client.js → GitHub Copilot
```

**Benefits:**
- ✅ One command startup (`npm run dev`)
- ✅ No separate service to maintain
- ✅ Faster (no HTTP overhead)
- ✅ Simpler deployment

## Advanced Configuration

### Change Account Type

Default is `individual`. For GitHub Copilot Business/Enterprise:

```javascript
// In lib/copilot-client.js
const state = {
  accountType: 'business', // or 'enterprise'
  // ...
};
```

### Custom VS Code Version

```javascript
// In lib/copilot-client.js
const state = {
  vsCodeVersion: '1.95.3', // Update version
  // ...
};
```

## API Reference

### `initializeCopilot(githubToken?)`

Initialize the Copilot client (auto-called on first use).

```javascript
import { initializeCopilot } from '@/lib/copilot-client';
await initializeCopilot(process.env.GITHUB_TOKEN);
```

### `createChatCompletions(payload)`

Create streaming chat completion.

```javascript
import { createChatCompletions } from '@/lib/copilot-client';

const response = await createChatCompletions({
  model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true,
  max_tokens: 2000
});

// response is a fetch Response with streaming body
```

### `getModels()`

Get available Copilot models.

```javascript
import { getModels } from '@/lib/copilot-client';
const models = await getModels(); // { data: [{id, name, ...}] }
```

### `getCopilotState()`

Get current client state (for debugging).

```javascript
import { getCopilotState } from '@/lib/copilot-client';
console.log(getCopilotState());
// { isInitialized: true, hasToken: true, tokenExpiresAt: 1234567890 }
```

## Migration from copilot-api

If upgrading from a version that used the separate `copilot-api` service:

1. ✅ Stop the copilot-api service (no longer needed)
2. ✅ Remove `COPILOT_API_URL` from `.env` (not used)
3. ✅ Add `GITHUB_TOKEN` to `.env` (see Quick Start above)
4. ✅ Delete `copilot-api/` directory (optional - no longer used)
5. ✅ Run `npm run dev` - works the same, just faster!

**All existing AI features work identically** - chat, tools, streaming, etc.

## Security Notes

- **Never commit `.env` to git** - Contains sensitive tokens
- Keep GitHub token secure (same as password)
- Token has full Copilot access - don't share
- Rotate token regularly from GitHub settings

## Support

If issues persist after troubleshooting:
1. Check console logs: `npm run dev` output
2. Verify Copilot subscription: https://github.com/settings/copilot
3. Test API manually: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/copilot_internal/v2/token`
