---
description: "AI agent instructions for Better IMDb (formerly WatchArr) - a movie/TV tracking app with embedded AI assistant, built with Next.js 16, SQLite, NextAuth, and Tailwind CSS."
applyTo: '**/*.jsx, **/*.js, **/*.css, **/*.json, **/*.py'
---

# Better IMDb Project Guide for AI Agents

**Project:** Better IMDb (`better-imdb`) - IMDb-like interface for searching, rating, tracking movies/TV shows with embedded AI recommendations.
**Version:** 0.1.0
**Tech Stack:** Next.js 16, React 19, SQLite (better-sqlite3), NextAuth v5 Beta, Tailwind CSS 4, Framer Motion.
**Languages:** JavaScript (Main App), Python (Cenima CLI).

---

## Architecture Overview

### Core Components
1.  **Frontend/Backend (monolith):** Next.js App Router (`app/`) handles UI and API routes.
2.  **Database:** SQLite (`better-imdb.db`) with multi-user schema.
3.  **AI Assistant:** Embedded GitHub Copilot integration (`lib/copilot-client.js`) - **No separate service required.**
4.  **External Data:** Proxies to IMDb API (`api.imdbapi.dev`) and streaming sources.
5.  **CLI Tool:** `cenima-cli/` for scraping/fetching content (standalone).

### Data Flow
1.  **User Action:** UI Component (Client) triggers generic `fetch` or server action.
2.  **API Route:** `app/api/*` handles request, validates session (`auth()`).
3.  **Data Access:** `lib/db.js` executes prepared SQLite statements (user-scoped).
4.  **External API:** `lib/api.js` or `app/api/proxy/` fetches from IMDb/Amazon.
5.  **AI Chat:**
    *   User sends message -> `app/api/ai/chat/route.js`.
    *   Server invokes `lib/copilot-client.js` to talk to GitHub Copilot API.
    *   Server executes tools (`lib/ai-tools.js`) if requested by AI.
    *   Stream response back to client (SSE).

---

## Project Structure

```
app/
  ai/                    # AI chat interface (Client Component)
  api/
    ai/chat/             # AI chat endpoint (SSE streaming)
    proxy/               # External API proxies (IMDb, etc.)
    lists|ratings/       # User data CRUD endpoints
  ...                    # Feature routes (anime, people, title, etc.)
cenima-cli/              # Standalone Python CLI for content scraping
copilot-api/             # Legacy/Standalone service (mostly unused by main app)
lib/
  ai-config.js           # AI system prompt & tool definitions
  ai-tools.js            # Tool implementations (search, DB operations)
  copilot-client.js      # Embedded GitHub Copilot client (Key File)
  db.js                  # SQLite singleton, migrations, schemas
  api.js                 # Axios wrapper for internal/external APIs
```

---

## Critical Workflows

### 1. Development
- **Start Server:** `npm run dev` (Port 3000)
- **Database:** Auto-created at `better-imdb.db` on first run.
- **Environment:** Requires `GITHUB_TOKEN` (Copilot access) and `AUTH_SECRET` / `AUTH_GITHUB_*` (NextAuth).

### 2. Database Management
- **Reset:** Delete `better-imdb.db`. Restart server to trigger auto-schema recreation (`lib/db.js`).
- **Schema Changes:** Edit `initializeDatabase` in `lib/db.js`.
- **Querying:** Always use `db.prepare().run/get/all()`. **ALWAYS filter by `user_id`**.

### 3. AI Assistant Debugging
- Logic resides in `app/api/ai/chat/route.js`.
- Token management in `lib/copilot-client.js`.
- Start a new chat to trigger fresh session/context.

---

## Coding Conventions

### JavaScript (Main App)
- **Files:** `.js` extensions. `jsx` is supported but `.js` is standard here.
- **Imports:** Use `@/` alias for root (e.g., `@/lib/db`).
- **Styling:** Tailwind CSS 4 (`className="text-white p-4"`).
- **Icons:** `lucide-react` (primary), `phosphor-icons` (legacy).
- **Animations:** Framer Motion for page transitions and micro-interactions.

### Database Patterns
- **User Scope:** Every read/write MUST check `session.user.id`.
  ```js
  // ✅ CORRECT
  db.prepare('SELECT * FROM lists WHERE user_id = ?').all(session.user.id);
  // ❌ WRONG
  db.prepare('SELECT * FROM lists').all();
  ```
- **Error Handling:** Graceful degradation. If an image or rating is missing, return `null`, don't crash.

### AI Implementation Rules
- **Tool Definition:** Add new tools to `TOOL_DEFINITIONS` in `lib/ai-config.js`.
- **Tool Execution:** Implement logic in `lib/ai-tools.js`.
- **System Prompt:** Edit `SYSTEM_PROMPT` in `lib/ai-config.js`.

---

## Integration Details

- **GitHub Copilot:**
  - Token is fetched via `GITHUB_TOKEN` env var or user's DB token.
  - Endpoints: `lib/copilot-client.js` mimics OpenAI API structure.
- **IMDb Proxy:**
  - `app/api/proxy/[...path]/route.js` forwards requests to `api.imdbapi.dev`.
  - Use `lib/api.js` client-side wrapper for consistent error handling.

## Known Stubs/Future
- **Cenima CLI:** Python tools in `cenima-cli/` are for future streaming integration.
- **Testing:** Currently limited. `npm run lint` available.
