---
description: "AI agent instructions for Better IMDb - a movie/TV tracking app with embedded AI assistant, built with Next.js 16, MongoDB, NextAuth, and Tailwind CSS."
applyTo: '**/*.ts, **/*.tsx, **/*.jsx, **/*.js, **/*.css, **/*.json'
---

# Better IMDb Project Guide for AI Agents

**Project:** Better IMDb (`better-imdb`) - IMDb-like interface for searching, rating, tracking movies/TV shows with embedded AI recommendations.
**Version:** 0.1.0
**Tech Stack:** Next.js 16, React 19, TypeScript, MongoDB Atlas, NextAuth v5 Beta, Tailwind CSS 4, Framer Motion.
**Languages:** TypeScript (Main App), Python (Cenima CLI).

---

## Architecture Overview

### Core Components
1.  **Frontend/Backend (monolith):** Next.js App Router (`app/`) handles UI and API routes.
2.  **Database:** MongoDB Atlas with multi-user document schema (collections: users, lists, list_items, ratings, ai_chats, ai_messages).
3.  **AI Assistant:** Embedded GitHub Copilot integration (`lib/copilot-client.ts`) - **No separate service required.**
4.  **External Data:** Proxies to IMDb API (`api.imdbapi.dev`) with retry logic and rate limiting.
5.  **Streaming Service:** Integrated TopCinema scraper (`lib/topcinema-scraper.ts`) for anime/movies/series streaming - **Pure TypeScript, no Python dependency.**

### Data Flow
1.  **User Action:** UI Component (Client) triggers `fetch` or server action.
2.  **API Route:** `app/api/*` handles request, validates session (`auth()`).
3.  **Data Access:** `lib/db.ts` provides MongoDB client with async getDb() - **all queries user-scoped**.
4.  **External API:** `lib/api.ts` or `app/api/proxy/` fetches from IMDb/Amazon with timeouts.
5.  **AI Chat:**
    *   User sends message -> `app/api/ai/chat/route.ts` (SSE streaming endpoint).
    *   Server invokes `lib/copilot-client.ts` to talk to GitHub Copilot API.
    *   Server executes tools (`lib/ai-tools.ts`) if requested by AI.
    *   Stream response back to client with proper error handling.
6.  **Content Streaming:**
    *   User requests stream -> `app/api/topcinema/stream/route.ts`.
    *   Server uses `lib/topcinema-scraper.ts` to fetch content from TopCinema.
    *   `lib/vidtube-processor.ts` extracts direct video URLs from embed pages.
    *   Returns video URL with proper headers for playback.

---

## Project Structure

```
app/
    topcinema/           # TopCinema streaming API endpoints
      search/route.ts    # Search movies/series/anime
      show/route.ts      # Get show details
      season/route.ts    # Get season episodes
      stream/route.ts    # Resolve stream URLs
  ...                    # Feature routes (anime, people, title, etc.)
cenima-cli/              # Legacy Python CLI (NOT USED - kept for reference)
lib/
  ai-config.ts           # AI system prompt & tool definitions (CRITICAL)
  ai-tools.ts            # Tool implementations (search, DB operations)
  copilot-client.ts      # Embedded GitHub Copilot client (Key File)
  db.ts                  # MongoDB client singleton (getDb, collections)
  api.ts                 # Axios wrapper for internal/external APIs
  search-service.ts      # Web search and URL crawling
  stream-service.ts      # Streaming link resolution
  topcinema-scraper.ts   # TopCinema content scraper (replaces Python)
  vidtube-processor.ts   # VidTube embed processor (extracts video URLs)rch, DB operations)
  copilot-client.ts      # Embedded GitHub Copilot client (Key File)
  db.ts                  # MongoDB client singleton (getDb, collections)
  api.ts                 # Axios wrapper for internal/external APIs
  search-service.ts      # Web search and URL crawling
  stream-service.ts      # Streaming link resolution
backup/
  lib/db.js.bak          # Legacy SQLite implementation (DO NOT USE)
  lib/db.sqlite.ts       # Legacy SQLite TypeScript version (DO NOT USE)
```

---

## Critical Workflows

### 1. Development
- **Start Server:** `npm run dev` (Port 3000)
- **Database:** MongoDB Atlas connection via `MONGODB_URI` env var. No local DB file.
- **Environment:** Requires:
  - `MONGODB_URI` - MongoDB Atlas connection string
  - `GITHUB_TOKEN` - Copilot access (or user's `copilot_token` in DB)
  - `AUTH_SECRET` - NextAuth JWT signing
  - `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` - GitHub OAuth

### 2. Database Management
- **Connection:** Uses MongoDB singleton pattern. Call `await getDb()` to get DB instance.
- **Collections:** `users`, `lists`, `list_items`, `ratings`, `ai_chats`, `ai_messages`, `stream_mappings`.
- **Schema:** MongoDB uses `_id` (ObjectId) for primary keys. References stored as strings for cross-collection lookups.
- **Querying:** 
  ```ts
  const db = await getDb();
  const lists = await db.collection('lists').find({ user_id: userId }).toArray();
  ```
- **User Scope:** **ALWAYS filter by `user_id`**. Never expose cross-user data.
- **List IDs:** Lists use MongoDB `ObjectId` (_id), but list_items store `list_id` as string. Always convert: `list._id.toString()`.

### 3. AI Assistant Debugging
- Logic resides in `app/api/ai/chat/route.ts`.
- Token management in `lib/copilot-client.ts` (automatic refresh).
- Tool execution in `lib/ai-tools.ts`.
- System prompt and tool definitions in `lib/ai-config.ts`.
- Start a new chat to trigger fresh session/context.

### 4. TypeScript Conventions
- **Strict Mode:** Disabled (`strict: false` in tsconfig). Use explicit types where beneficial.
- **Imports:** Use `@/` alias for root (e.g., `@/lib/db`).
- **Async/Await:** All DB operations are async. Never use sync methods.
- **Error Handling:** Wrap DB calls in try/catch. Log errors but degrade gracefully.

---

## Coding Conventions

### TypeScript (Main App)
- **Files:** `.ts` for modules, `.tsx` for React components.
- **Imports:** Use `@/` alias for root (e.g., `@/lib/db`, `@/components/MediaCard`).
- **Styling:** Tailwind CSS 4 (`className="text-white p-4"`).
- **Icons:** `lucide-react` (primary), `phosphor-icons` (legacy, being phased out).
- **Animations:** Framer Motion for page transitions and micro-interactions.
- **Fonts:** Inter (body), Space Grotesk (thinking blocks via `--font-thinking` CSS variable).

### MongoDB Patterns
- **User Scope:** Every read/write MUST filter by `user_id`:
  ```ts
  // ✅ CORRECT
  await db.collection('lists').find({ user_id: userId }).toArray();
  // ❌ WRONG
  await db.collection('lists').find().toArray(); // Exposes all users' data!
  ```
- **ObjectId Handling:** Convert to string when storing references:
  ```ts
  const list = await db.collection('lists').findOne({ user_id, name });
  const listIdStr = list._id.toString(); // Use this for list_items.list_id
  ```
- **Upserts:** Use `updateOne` with `{ upsert: true }` for ratings:
  ```ts
  await db.collection('ratings').updateOne(
    { user_id, title_id },
    { $set: { score, review, rated_at: new Date() } },
    { upsert: true }
  );
  ```
- **Error Handling:** Graceful degradation. If a query fails, return `null` or `[]`, don't crash the app.

### AI Implementation Rules
- **Tool Definition:** Add new tools to `TOOL_DEFINITIONS` in `lib/ai-config.ts`.
- **Tool Execution:** Implement logic in `lib/ai-tools.ts`. Add to `executeTool` switch statement.
- **System Prompt:** Edit `SYSTEM_PROMPT` in `lib/ai-config.ts`.
- **Rate Limiting:** `batch_search_media` includes retry logic with exponential backoff for 429 errors.
- **Streaming:** AI chat uses SSE. Ensure `maxDuration` is set on route for long-running operations.

---

## Integration Details

### GitHub Copilot
- **Token Management:** `lib/copilot-client.ts` handles token fetching/refresh automatically.
- **Token Storage:** User's `copilot_token` in DB (optional) or `GITHUB_TOKEN` env var (fallback).
- **API Compatibility:** Mimics OpenAI API structure for easy drop-in replacement.
- **Initialization:** Call `await initializeCopilot(githubToken)` before first request (handles caching).

### IMDb API
- **Proxy:** `app/api/proxy/[...path]/route.ts` forwards requests to `api.imdbapi.dev`.
- **Client:** `lib/api.ts` provides axios wrapper with timeouts (QUICK: 5s, DEFAULT: 10s, SLOW: 20s).
- **Retry Logic:** Tools in `lib/ai-tools.ts` implement exponential backoff for 429/5xx err

### TopCinema Streaming (NEW)
- **Scraper:** `lib/topcinema-scraper.ts` uses `got-scraping` (browser impersonation) and `cheerio` (HTML parsing).
- **VidTube Processor:** `lib/vidtube-processor.ts` extracts direct video URLs from embed pages.
- **API Endpoints:** 
  - `GET /api/topcinema/search?q=query&type=anime` - Search content
  - `GET /api/topcinema/show?url=...` - Get show details with seasons
  - `GET /api/topcinema/season?url=...` - Get episode list for a season
  - `GET /api/topcinema/stream?url=...` - Resolve streaming URL
- **No Python Required:** Fully integrated TypeScript solution using existing dependencies.ors.
- **Batch Optimization:** `batch_search_media` processes queries in chunks with delays to avoid rate limits.

### Authentication
- **NextAuth v5 Beta:** GitHub OAuth provider in `auth.js`.
- **User Creation:** First login creates user + default lists (Watched, Watching, To Watch, Favorites).
- **Session:** Use `const session = await auth()` in API routes to get `session.user.id`.
- **Test Login:** Credentials provider (`test-login`) for development without GitHub OAuth.

---

## Key Files & Patterns

### Database Schema (MongoDB Collections)
```ts
// users: { id: string, name, email, image, copilot_token, created_at }
// lists: { _id: ObjectId, user_id: string, name: string, created_at: Date }
// list_items: { _id: ObjectId, list_id: string, title_id: string, added_at: Date }
// ratings: { user_id: string, title_id: string, score: number, review?: string, rated_at: Date }
// ai_chats: { _id: string, user_id: string, title?: string, created_at, updated_at }
// ai_messages: { _id: string, chat_id: string, role: string, content: string, created_at }
```

### AI Tool Execution Pattern
```ts
// lib/ai-tools.ts
export async function executeTool(toolName: string, args: any, userId: string | null): Promise<any> {
  const tools: Record<string, ToolExecutor> = {
    'search_imdb': (a) => searchIMDB(a.query, a.limit),
    'get_user_lists': async (_, uid) => uid ? await getUserLists(uid) : [],
    // ... more tools
  };
  const executor = tools[toolName];
  return executor ? await executor(args, userId) : { error: 'Unknown tool' };
}
```

### Batch Operations with Rate Limiting
```ts
// lib/ai-tools.ts - batchSearchMedia() example
const CONCURRENT_REQUESTS = 2;
const DELAY_BETWEEN_CHUNKS = 1500; // ms
const chunks = chunkArray(queries, CONCURRENT_REQUESTS);

for (let i = 0; i < chunks.length; i++) {
  const results = await Promise.all(chunk.map(q => fetchWithRetry(q)));
  batchedResults.push(...results);
  if (i < chunks.length - 1) await delay(DELAY_BETWEEN_CHUNKS);
}
```

### Streaming AI Response Pattern
```ts
// app/api/ai/chat/route.ts
const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of streamChatCompletion(payload, githubToken)) {
      const line = `data: ${JSON.stringify(chunk)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
```

### TopCinema Scraping Pattern
```ts
// lib/topcinema-scraper.ts - Basic usage
import { topCinemaScraper } from '@/lib/topcinema-scraper';

// Search for anime
const results = await topCinemaScraper.search('One Piece', 'anime');

// Get show details with seasons
const details = await topCinemaScraper.getShowDetails(results[0].url);

// Fetch episodes for a season
const episodes = await topCinemaScraper.fetchSeasonEpisodes(details.seasons[0]);

// Get streaming servers for an episode
const servers = await topCinemaScraper.fetchEpisodeServers(episodes[0]);

// Extract direct video URL
import { vidTubeProcessor } from '@/lib/vidtube-processor';
const videoUrl = await vidTubeProcessor.extract(servers[0].embed_url);
```

---

## Common Pitfalls & Solutions

### 1. MongoDB ObjectId vs String References
**Problem:** List IDs are ObjectIds, but list_items store them as strings.
**Solution:** Always convert when storing references:
```ts
const listIdStr = list._id.toString();
await db.collection('list_items').insertOne({ list_id: listIdStr, ... });
```

### 2. User Scoping
**Problem:** Forgetting to filter by `user_id` exposes cross-user data.
**Solution:** ALWAYS include `user_id` in queries:
```ts
// ✅ CORRECT
const lists = await db.collection('lists').find({ user_id: userId }).toArray();
```

### 3. Rate Limiting on IMDb API
**Problem:** Batch operations hit 429 errors.
**Solution:** Implement retry with exponential backoff (see `batchSearchMedia` in `lib/ai-tools.ts`).

### 4. AI Token Expiration
**Problem:** Copilot token expires mid-session.
**Solution:** `lib/copilot-client.ts` auto-refreshes tokens when they expire within 2 minutes.

### 5. Legacy File Confusion
**Problem:** Editing old SQLite files (`lib/db.js.bak`, `lib/db.sqlite.ts`) or Python CLI (`cenima-cli/`).
**Solution:** 
- Always use `lib/db.ts` (MongoDB version). Legacy files are backups only.
- Use `lib/topcinema-scraper.ts` for streaming (TypeScript). Python CLI is deprecated.

### 6. Streaming with got-scraping
**Problem:** Need browser-like requests for scraping.
**Solution:** `got-scraping` (already installed) provides browser impersonation:
```ts
import { gotScraping } from 'got-scraping';
const response = await gotScraping(url, { headers: { ... } });
```
- **TopCinema Logs:** Check for `[TopCinema]` and `[VidTube]` logs in server console

## Known Stubs/Future Work
- **Cenima CLI:** Python tools in `cenima-cli/` are **DEPRECATED** - use `lib/topcinema-scraper.ts` instead.
- **Testing:** Currently limited. `npm run lint` available. No unit/integration tests yet.
- **Copilot API Folder:** `copilot-api/` is legacy standalone service, mostly unused by main app now.
- **Stream Integration:** Consider adding TopCinema streaming as an AI tool for the chat assistant
- **DB Inspection:** Use MongoDB Compass or Atlas UI to inspect collections
- **AI Chat Logs:** Check server console for `[Copilot]` and `[Web Search]` logs
- **Network Inspection:** IMDb API calls log to console with status codes

---

## Known Stubs/Future Work
- **Cenima CLI:** Python tools in `cenima-cli/` for future streaming integration (standalone, not used by main app yet).
- **Testing:** Currently limited. `npm run lint` available. No unit/integration tests yet.
- **Copilot API Folder:** `copilot-api/` is legacy standalone service, mostly unused by main app now.
