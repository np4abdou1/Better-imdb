---
description: "AI agent instructions for WatchArr - an IMDb-like movie/TV tracking app with AI assistant, built with Next.js 16, SQLite, NextAuth, and Framer Motion."
applyTo: '**/*.jsx, **/*.js, **/*.css'
---

# WatchArr Project Guide for AI Agents

**Project:** WatchArr (`watcharr`) - IMDb-like interface for searching, rating, tracking movies/TV shows with AI-powered recommendations
**Version:** 0.1.0 (early development)
**Tech Stack:** Next.js 16.1.6, React 19, SQLite (better-sqlite3), NextAuth v5 Beta, Tailwind CSS 4, Framer Motion, JavaScript (no TypeScript)

---

## Architecture Overview

### Project Structure
```
app/
  api/
    auth/[...nextauth]/  # NextAuth OAuth handlers
    proxy/               # External IMDb API proxies (search, titles, episodes, credits, images, videos)
    lists/               # SQLite list management (GET, POST, item operations) - user-scoped
    ratings/             # SQLite rating storage (GET by ID, POST to save) - user-scoped
    ai/
      chat/              # AI streaming chat endpoint (SSE)
      chats/             # Chat history CRUD (GET all, POST new)
        [id]/            # Individual chat operations (GET messages, DELETE)
      models/            # Available AI models list
  ai/                    # AI chat interface page (Client Component)
  anime/                 # Top anime page
  people/                # People/actors page
  top/                   # Top-rated movies/TV page
  trending/              # Trending titles page
  lists/                 # Lists overview page (Client Component)
    [id]/                # Individual list detail page
  title/[id]/            # Title detail page (movies/TV shows)
  profile/               # User profile and settings
  login/                 # GitHub OAuth login page
  page.js                # Home search page with animated UI
  layout.js              # Root layout with Providers
  template.js            # Page transition wrapper
lib/
  db.js                  # SQLite singleton with auto-recovery + multi-user schema
  api.js                 # Axios client wrapper with graceful degradation
  ai-config.js           # AI system prompt, tool definitions, taste profile generation
  ai-tools.js            # Tool implementations (search, lists, ratings)
  amazon-image-loader.js # Custom loader for Amazon-hosted images (avoids next/image timeouts)
  api-config.js          # API base URL, timeouts, blur placeholder
  copilot-proxy.js       # GitHub Copilot token management
components/
  MediaCard.js           # Standardized poster card (used everywhere)
  FloatingNav.js         # Navigation component
  Navbar.js              # Top navigation
  FilterPanel.js         # Filter UI for lists/grids
  FilterDropdown.js      # Dropdown filter component
  Skeleton.js            # Loading skeleton UI
  Providers.js           # NextAuth SessionProvider wrapper
copilot-api/             # Separate TypeScript service (standalone)
  src/                   # GitHub Copilot → OpenAI-compatible proxy
    main.ts              # Entry point
    routes/              # API route handlers
    services/            # Copilot token, chat completions
auth.config.js           # NextAuth configuration
auth.js                  # NextAuth instance with GitHub provider
middleware.js            # Route protection (redirects unauthenticated users)
public/                  # Static assets (SVGs)
```

### Data Flow
1. **External API**: `app/api/proxy/*` → `https://api.imdbapi.dev` (IMDb data source)
2. **Client API**: `lib/api.js` → `/api/*` endpoints
3. **Database**: `lib/db.js` → `watcharr.db` (SQLite at project root, multi-user schema)
4. **AI Chat**: `app/ai/page.js` → `/api/ai/chat` → `copilot-api` service (port 4141) → GitHub Copilot
5. **Authentication**: NextAuth v5 (Beta) → GitHub OAuth → Session management

---

## Authentication System (NextAuth v5 Beta)

### Setup (`auth.config.js` + `auth.js`)
- **Provider**: GitHub OAuth (configured in `auth.js`)
- **Session callback**: Injects user ID into session token (see `auth.config.js`)
- **Sign-in callback** (`auth.js`):
  - Checks if user exists in database (`getUserByEmail`)
  - Creates new user + default lists on first sign-in
  - Always returns `true` to allow sign-in

### Middleware (`middleware.js`)
- **Protected routes**: All routes except `/api`, `/_next`, `/login`
- **Behavior**: Redirects unauthenticated users to `/login`
- **Login page redirect**: Authenticated users visiting `/login` → redirect to `/`

### Client-Side Usage
```js
import { useSession, signIn, signOut } from 'next-auth/react';

// In component
const { data: session, status } = useSession();
// status: 'loading' | 'authenticated' | 'unauthenticated'
// session.user: { id, name, email, image }

// Sign in/out
signIn('github', { callbackUrl: '/profile' });
signOut({ callbackUrl: '/login' });
```

### Server-Side (API Routes)
```js
import { auth } from '@/auth';

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Use session.user.id for user-scoped queries
}
```

### Critical Notes
- NextAuth v5 is **beta** - API may change
- User ID comes from `session.user.id` (set in JWT callback)
- All lists/ratings are user-scoped - **always filter by `user_id`**
- Database user ID must match session user ID (see `auth.js` JWT callback)

---

## Critical Database Patterns

### 1. Multi-User Database Schema (`lib/db.js`)
**Database is now multi-user. All lists/ratings are user-scoped.**

#### Schema with User Support
```sql
users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, image TEXT)
lists (id INTEGER, user_id TEXT FK→users.id, name TEXT, created_at)
list_items (id INTEGER, list_id FK→lists.id ON DELETE CASCADE, title_id TEXT, added_at)
ratings (user_id TEXT, title_id TEXT, score REAL CHECK(0-10), review TEXT, PRIMARY KEY (user_id, title_id))
ai_chats (id TEXT PRIMARY KEY, user_id TEXT FK→users.id, title TEXT, created_at, updated_at)
ai_messages (id TEXT PRIMARY KEY, chat_id FK→ai_chats.id, role TEXT, content TEXT, created_at)
```

#### Auto-Migration on Startup
- **Detects legacy schema**: Checks if `user_id` column exists in `lists`/`ratings`
- **Migrates automatically**: Creates new table, copies data, drops old table, renames
- **Legacy data handling**: Orphaned lists get `user_id = NULL`, ratings get `user_id = 'legacy'`
- **Default lists per user**: Created on first sign-in: `Watched`, `Watching`, `To Watch`, `Favorites`

### 2. Database Initialization
- **Singleton pattern**: Database is initialized once and exported
- **Auto-recovery**: If database is corrupted (`SQLITE_CORRUPT`), automatically:
  - Backs up to `watcharr.db.corrupted.<timestamp>`
  - Deletes corrupted file
  - Creates fresh database with schema
- **Foreign keys enabled**: `db.pragma('foreign_keys = ON')` - ON DELETE CASCADE for list_items, ai_messages
- **WAL mode**: `db.pragma('journal_mode = WAL')` for better concurrency

### 3. SQL Safety Rules
- **ALWAYS use prepared statements**: `db.prepare(sql).run(params)` / `.get()` / `.all()`
- **ALWAYS scope queries by user_id**: Never return another user's data
- **NEVER concatenate user input into SQL strings**
- Example:
  ```js
  // ✅ CORRECT - user-scoped query
  const stmt = db.prepare('SELECT * FROM lists WHERE user_id = ? AND id = ?');
  const list = stmt.get(session.user.id, listId);

  // ❌ WRONG - SQL injection risk + missing user scope
  const list = db.prepare(`SELECT * FROM lists WHERE id = ${listId}`).get();
  ```

---

## AI Chat Assistant Architecture

### Overview
WatchArr includes a streaming AI chat assistant for movie/TV recommendations, powered by GitHub Copilot.

### Architecture Layers
1. **Frontend**: `app/ai/page.js` - Streaming chat UI with SSE (Server-Sent Events)
2. **Backend API**: `app/api/ai/chat/route.js` - Orchestrates AI conversation loop
3. **Proxy Service**: `copilot-api/` - Separate TypeScript service on port 4141
4. **External API**: GitHub Copilot (gpt-4.1 by default)

### Copilot-API Service (Standalone)
- **Location**: `copilot-api/` directory (separate from main Next.js app)
- **Technology**: TypeScript, Bun runtime, OpenAI-compatible API
- **Purpose**: Converts GitHub Copilot into OpenAI-compatible chat completions API
- **Port**: 4141 (configured in `COPILOT_API_URL` env var or default `http://localhost:4141`)
- **Commands** (run in `copilot-api/` directory):
  ```bash
  bun install         # Install dependencies
  bun run dev         # Development mode
  bun run build       # Production build
  bun run start       # Run production build
  ```
- **Environment**: Requires `GITHUB_TOKEN` environment variable (GitHub Copilot access)
- **API Compatibility**: Implements `/v1/chat/completions` endpoint (OpenAI-style)

### AI Chat Streaming Flow
```
User Input → /api/ai/chat → copilot-api (port 4141) → GitHub Copilot
                ↓
          Tool Calls Loop:
            1. AI requests tool (search_imdb, add_to_list, etc.)
            2. Execute tool in lib/ai-tools.js
            3. Return results to AI
            4. AI continues response
                ↓
          Parse media_grid blocks → Enrich titles (fetch posters/ratings)
                ↓
          Stream to client (SSE format)
```

### Tool Calling Pattern
AI can call functions to interact with IMDB and user data. Available tools (see `lib/ai-config.js`):
- `search_imdb(query, limit)` - Search IMDB
- `batch_search_media(queries)` - **PREFERRED**: Batch search multiple titles in parallel
- `get_title_details(imdb_id)` - Get full title metadata
- `get_user_lists()` - Fetch user's lists with contents
- `get_user_ratings()` - Fetch user's ratings
- `add_to_list(list_name, title_id)` - Add title to list
- `rate_title(title_id, score, review)` - Save rating

### Media Grid Rendering
AI outputs recommendations using `media_grid` code blocks (parsed in backend):
```markdown
# In AI response:
```media_grid
[
  {"id": "tt0111161", "title": "Shawshank", "year": 1994, "reason": "Top drama"},
  {"id": "tt0468569", "title": "Dark Knight", "year": 2008, "reason": "Action thriller"}
]
```
```

Backend parses this, enriches with poster URLs/ratings, sends as SSE event:
```js
data: {"type": "media_grid", "titles": [{id, primaryTitle, year, poster, rating, reason}, ...]}
```

Frontend (`app/ai/page.js`) renders using `MediaCard` component.

### Chat Persistence
- **Database tables**: `ai_chats`, `ai_messages` (see schema above)
- **Auto-save**: User/assistant messages saved to DB on send
- **Auto-title generation**: First message generates chat title (short GPT completion)
- **Chat history**: Sidebar shows all user chats, sorted by `updated_at` (most recent first)

### System Prompt Strategy (RAG-lite)
Instead of raw JSON context injection, taste profile is natural language summary:
```
User has rated 15 titles (average: 7.2/10).
Highly rated (8+): 8 titles.
Recently rated: The Matrix (9/10), Inception (8.5/10), ...
Already watched: 42 titles - DO NOT recommend these.
```
See `generateTasteProfile()` in `lib/ai-config.js`.

### Performance Optimizations
- **Batch search**: AI uses `batch_search_media` to resolve multiple titles in one tool call (faster than sequential `search_imdb`)
- **Deduplication**: Media grid items deduplicated by IMDB ID before rendering
- **Streaming display**: Text streams immediately; thinking blocks collapsible
- **Enrichment**: Media grid titles enriched with poster/rating data in backend (avoids client API calls)

### Critical AI Chat Notes
- **Service dependency**: Requires `copilot-api` running on port 4141 (separate service)
- **Environment variable**: `COPILOT_API_URL` defaults to `http://localhost:4141`
- **Error handling**: If copilot-api unreachable, displays "AI service unavailable" error
- **Streaming format**: SSE with `data:` prefix, JSON payloads
- **Thinking blocks**: AI can use `<think>...</think>` tags for internal reasoning (displayed in collapsible UI)

---

## API Route Patterns

### 1. Error Handling Conventions
**Route handlers should return JSON with HTTP status codes:**
```js
// Validation error
if (!name) {
  return NextResponse.json({ error: 'Name required' }, { status: 400 });
}

// Unique constraint violation
if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
  return NextResponse.json({ error: 'Already exists' }, { status: 409 });
}

// Unauthorized (missing session)
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Generic server error
return NextResponse.json({ error: 'Failed', message: error.message }, { status: 500 });
```

### 2. Proxy Routes (`app/api/proxy/*`)
- Forward requests to `https://api.imdbapi.dev`
- Use axios for external HTTP requests
- Prefer `retryWithBackoff` + `TIMEOUTS` from `lib/api-config.js` for slow endpoints
- Return generic error messages to client (don't expose internal API details)
- Example: `app/api/proxy/search/route.js`

### 3. Database Routes (`app/api/lists/*`, `app/api/ratings/*`)
- Import `db` from `@/lib/db`
- Import `auth` from `@/auth` to get session
- **ALWAYS scope by user_id**: Check `session?.user?.id` and filter queries
- Use prepared statements for all queries
- Handle SQLite constraint errors with appropriate status codes
- Log errors with `console.error()` but return user-friendly messages

### 4. AI Routes (`app/api/ai/*`)
- Streaming responses use `ReadableStream` + SSE format
- Tool execution happens in backend (security)
- All user data scoped by session user ID
- Chat persistence is optional (graceful degradation if DB fails)

---

## Client-Side API Patterns (`lib/api.js`)

### Graceful Degradation Strategy
**For non-critical data (images, videos, credits, ratings), catch errors and return null/empty:**
```js
// ✅ Pattern used in lib/api.js
export const getRating = async (id) => {
  try {
    const { data } = await api.get(`/ratings/${id}`);
    return data;
  } catch (error) {
    if (error.response?.status === 500 || error.response?.status === 404) {
      console.warn('Rating not found:', error.message);
      return null; // Don't throw - allow UI to render without rating
    }
    throw error;
  }
};

export const getTitleImages = async (id) => {
  try {
    // ... fetch logic
  } catch (error) {
    console.error('Error fetching images:', error);
    return { images: [], totalCount: 0 }; // Graceful fallback
  }
};
```

**Why:** UIs should render with missing data rather than crash entirely.

---

## UI/Animation Patterns

### 1. Client Components
All pages use `'use client'` directive (first line) because:
- Interactive state (search, forms, user input)
- Framer Motion animations
- Browser APIs (mouse tracking)
- NextAuth session hooks (`useSession`)

### 2. Framer Motion Patterns
**Used extensively for smooth transitions:**
```jsx
// Layout animations (search bar transitions)
<motion.div layout transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}>
  {/* Content */}
</motion.div>

// Staggered grid animations
<AnimatePresence mode="popLayout">
  {results.map((item, index) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }} // Stagger
    />
  ))}
</AnimatePresence>
```

### 3. Search UX Pattern (`app/page.js`)
- **Debounced search**: 500ms delay (`useEffect` + `setTimeout`)
- **Instant UI transition**: `hasTyped` updates immediately on input (no delay)
- **Typing animation**: Placeholder cycles through messages with typewriter effect
- **Mouse spotlight**: Radial gradient follows mouse position (`mousemove` event)

### 4. MediaCard Component (`components/MediaCard.js`)
**Standardized poster card used across all pages (home, trending, top, anime, people, AI chat):**
- Props: `title` (object), `priority` (boolean for image loading)
- **Graceful poster fallback**: If no `primaryImage.url`, shows gradient background + Film icon
- **Hover effects**: Border glow, scale, gradient overlay with metadata
- **Image optimization**: Uses `amazonImageLoader` for Amazon CDN URLs, `loading="lazy"` by default
- **Metadata display**: Title, year, rating (Star icon), type badge (Movie/TV/Mini)
- **Link**: Wraps entire card with `Link` to `/title/${title.id}`

Example usage:
```jsx
<MediaCard title={normalizedTitle} priority={index < 2} />
```

### 5. Styling Conventions
- **Tailwind CSS 4**: All styles inline with `className`
- **clsx + tailwind-merge**: Use for conditional classes (imported as `clsx`)
- **Dark theme by default**: White text on `#181818` background
- **Hover states**: Most cards/buttons have `group-hover:` effects
- **Image placeholders**: Use the enhanced gradient fallback (see MediaCard component)
- **Consistent spacing**: Use multiples of 4px/8px for padding/margin

---

## Development Workflows

### Running the App
```bash
npm run dev    # Start Next.js dev server on localhost:3000 (Turbopack)
npm run build  # Production build
npm run start  # Serve production build
npm run lint   # Run ESLint

# AI Service (in copilot-api/ directory)
cd copilot-api
bun run dev    # Start copilot-api on port 4141 (required for AI chat)
```

### Environment Variables
```bash
# Required for GitHub OAuth
AUTH_SECRET=<random-string>       # Generate: openssl rand -base64 32
AUTH_GITHUB_ID=<github-oauth-id>
AUTH_GITHUB_SECRET=<github-oauth-secret>

# Optional overrides
DATABASE_PATH=watcharr.db          # SQLite database path
COPILOT_API_URL=http://localhost:4141  # AI service URL
IMDB_API_BASE=https://api.imdbapi.dev  # External API base URL

# Copilot-API service (in copilot-api/.env)
GITHUB_TOKEN=<github-copilot-token>
```

### Database Location
- **Development**: `watcharr.db` at project root
- **Warning**: SQLite file will reset on redeployment in stateless environments
- **Best for**: Self-hosted VPS, Docker, local development
- **Not suitable for**: Vercel, Cloudflare Workers (use managed DB instead)

### Adding New Features

**When adding list/rating features:**
1. Check if database schema needs updating (`lib/db.js` line 10-140)
2. Ensure queries are user-scoped (`WHERE user_id = ?`)
3. Create API route in `app/api/[feature]/route.js` with `auth()` session check
4. Add client function to `lib/api.js` with graceful error handling
5. Test database migration (delete `watcharr.db` and restart to trigger schema recreation)

**When adding AI tools:**
1. Define tool schema in `lib/ai-config.js` (`TOOL_DEFINITIONS`)
2. Implement tool function in `lib/ai-tools.js`
3. Add case to `executeTool()` switch statement
4. Test with AI chat - tool should auto-execute when AI calls it

**When adding external data sources:**
1. Create proxy route in `app/api/proxy/[endpoint]/route.js`
2. Forward to `https://api.imdbapi.dev` with axios
3. Handle timeout/network errors gracefully
4. Return generic error messages (don't expose API internals)

---

## Project-Specific Conventions

### 1. Use JavaScript, Not TypeScript
- Main app uses `.js` files (no TypeScript)
- `copilot-api/` subdirectory uses TypeScript (separate service)
- Use JSDoc comments for type hints if needed in main app
- Match existing patterns in codebase

### 2. Error Handling Philosophy
- **Critical errors** (database connection, validation): Return 400/500 and log
- **Non-critical errors** (missing images, ratings): Return null/empty and continue
- **User errors** (duplicate list names): Return 409 with clear message
- **Auth errors**: Return 401 for missing session, redirect via middleware

### 3. User Input
- Currently uses browser `prompt()` for list names (see `app/profile/page.js`)
- When replacing with proper modals, maintain same validation patterns
- Always sanitize input before database insertion (use prepared statements)

### 4. File Naming
- Components: `PascalCase.js` (MediaCard.js, FloatingNav.js)
- Routes: `route.js` (standard Next.js convention)
- Utilities: `camelCase.js` (api.js, db.js, ai-config.js)
- Config files: `kebab-case.js` (auth.config.js, api-config.js)

### 5. Imports
- Use `@/*` alias for absolute imports (e.g., `@/lib/db`, `@/components/MediaCard`)
- Configured in `jsconfig.json`
- External packages: React hooks, NextAuth, Framer Motion, Lucide/Phosphor icons

---

## Known Issues & Incomplete Features

1. **No tests**: Zero test coverage (production blocker)
2. **No input validation library**: Manual validation in routes (should add Zod)
3. **No environment variable validation**: Missing dotenv-safe or similar
4. **Large components**: `app/ai/page.js` (550+ lines), `app/title/[id]/page.js` (350+ lines) need refactoring
5. **No rate limiting**: DDoS vulnerable (especially AI chat endpoint)
6. **No CSRF protection**: NextAuth provides some, but API routes unprotected
7. **Copilot-API dependency**: AI chat requires separate service running (not self-contained)
8. **No database migrations**: Schema updates require manual inspection/testing

---

## Performance Considerations

1. **Debounce search queries**: 500ms delay prevents API spam
2. **Image loading strategy**:
   - Use `next/image` with `amazonImageLoader` for Amazon CDN URLs to avoid `/_next/image` timeouts
   - Keep `priority` limited to the first 1-2 visible cards in grids
   - Tighten `sizes` on posters to match actual card widths (e.g., `240px` for grids)
   - Prefer `loading="lazy"` for the rest
3. **Prepared statement reuse**: Consider caching prepared statements for high-frequency queries
4. **Animation performance**: Framer Motion uses GPU-accelerated transforms
5. **AI streaming**: SSE keeps connection open - ensure proper cleanup on unmount
6. **Batch operations**: AI uses `batch_search_media` instead of sequential searches
7. **Database indexes**: Indexes on `user_id`, `chat_id`, `list_id`, `title_id` for fast lookups

---

## Security Notes

- ✅ SQL injection protected (prepared statements everywhere)
- ✅ User data isolation (all queries scoped by `user_id`)
- ✅ NextAuth session management (JWT-based)
- ✅ Route protection via middleware
- ✅ No known dependency vulnerabilities (`npm audit` passes)
- ❌ No input sanitization library (XSS risk if rendering user HTML)
- ❌ No rate limiting (DDoS vulnerable, especially `/api/ai/chat`)
- ❌ No CSRF protection on API routes
- ❌ GitHub token exposure risk (copilot-api service must be secured)

---

## Quick Reference

**Default Lists (per user):** `Watched`, `Watching`, `To Watch`, `Favorites` (auto-created on sign-up)
**Database Path:** `./watcharr.db` (project root)
**External API:** `https://api.imdbapi.dev`
**AI Service:** `http://localhost:4141` (copilot-api)
**Amazon image loader:** `lib/amazon-image-loader.js` (use on `next/image` for Amazon-hosted posters)
**Search Debounce:** 500ms
**Rating Scale:** 0-10 (enforced by CHECK constraint)
**Component Library:** Lucide React icons (primary), Phosphor Icons (legacy)
**Animation Library:** Framer Motion
**Auth Provider:** GitHub OAuth via NextAuth v5 Beta
**AI Model:** gpt-4.1 (default, configurable)

---

## When Making Changes

1. **Database changes**: Update schema in `lib/db.js`, ensure migration logic handles existing data, test recovery flow
2. **API routes**: Use NextResponse, prepared statements, proper status codes, **always check auth and scope by user_id**
3. **Client API**: Add graceful error handling, return null/empty for non-critical data
4. **UI components**: Match existing motion patterns, use clsx for conditional styles, use MediaCard for all poster displays
5. **Testing**: Currently none - consider adding tests for critical paths (database, API routes, auth)
6. **AI features**: Update tool definitions in `ai-config.js`, implement in `ai-tools.js`, test in chat UI

---

**For Next.js-generic best practices** (Server Components, caching, route handlers), defer to official Next.js 16 documentation. This file focuses solely on WatchArr-specific patterns and architecture.
