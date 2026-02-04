# Better IMDb

An IMDb-like interface for searching, rating, and tracking movies/TV shows with an AI-powered recommendation assistant.

## Features

- 🎬 **Movie & TV Search** - Search and explore titles from IMDb
- ⭐ **Personal Ratings** - Rate and review movies/shows
- 📝 **Custom Lists** - Create and manage watchlists
- 🤖 **AI Assistant (Orb)** - Get personalized recommendations powered by GitHub Copilot
- 🔍 **Web Search** - AI can search the web for latest information
- 🎨 **Modern UI** - Smooth animations with Framer Motion
- 🔐 **GitHub OAuth** - Secure authentication

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd better-imdb
npm install
```

### 2. Setup Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required variables:

```bash
# NextAuth GitHub OAuth
AUTH_GITHUB_ID=your_github_oauth_id
AUTH_GITHUB_SECRET=your_github_oauth_secret
AUTH_SECRET=your_random_secret

# GitHub Copilot Token (for AI features)
GITHUB_TOKEN=ghp_your_token_here
```

**Get GitHub Copilot Token:**
- See [COPILOT_SETUP.md](./COPILOT_SETUP.md) for detailed instructions
- Quick: https://github.com/settings/tokens → Generate token with `copilot` scope

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
  ├── api/                 # API routes
  │   ├── ai/             # AI chat & models endpoints
  │   ├── lists/          # List management
  │   ├── ratings/        # User ratings
  │   └── proxy/          # IMDb API proxies
  ├── ai/                 # AI chat interface
  ├── title/[id]/         # Movie/TV detail pages
  ├── lists/              # List management pages
  └── profile/            # User profile
components/
  ├── MediaCard.js        # Poster card component
  ├── FloatingNav.js      # Navigation
  └── ai/                 # AI chat components
lib/
  ├── copilot-client.js   # Embedded Copilot integration
  ├── ai-config.js        # AI system prompt & tools
  ├── ai-tools.js         # Tool implementations
  ├── db.js               # SQLite database
  └── api.js              # IMDb API client
```

## Architecture

### AI Integration (No Separate Service!)

The app includes **embedded GitHub Copilot support** - no external services required:

```
Next.js App → lib/copilot-client.js → GitHub Copilot API
```

**Features:**
- Automatic token management & refresh
- Streaming responses
- Tool calling (search, lists, ratings)
- Vision support (when available)

See [COPILOT_SETUP.md](./COPILOT_SETUP.md) for detailed configuration.

### Database

- **SQLite** (`better-imdb.db`) for local development
- Multi-user schema with foreign key constraints
- Auto-migration on schema changes

For production, consider:
- **Turso** (serverless SQLite)
- **Neon** or **Supabase** (PostgreSQL)

### External APIs

- **IMDb API** (`https://api.imdbapi.dev`) - Movie/TV data
- **SearXNG** (optional) - Web search for AI assistant
- **GitHub Copilot** - AI chat completions

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

### Database Reset

```bash
rm better-imdb.db
# Restart dev server - will recreate schema
```

## Deployment

### Vercel (Recommended for Serverless)

**Requirements:**
- Switch from SQLite to managed database (Turso/Neon/Supabase)
- Add environment variables in Vercel dashboard
- Deploy: `vercel deploy --prod`

### Self-Hosted (VPS/Docker)

Works out-of-the-box with SQLite:

```bash
npm run build
npm start
# Or use PM2: pm2 start npm --name "better-imdb" -- start
```

**Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_GITHUB_ID` | Yes | GitHub OAuth App ID |
| `AUTH_GITHUB_SECRET` | Yes | GitHub OAuth App Secret |
| `AUTH_SECRET` | Yes | Random string for JWT signing |
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token (copilot scope) |
| `IMDB_API_BASE` | No | IMDb API base URL (default: https://api.imdbapi.dev) |
| `DATABASE_PATH` | No | SQLite database path (default: ./better-imdb.db) |
| `SEARXNG_BASE_URL` | No | SearXNG instance URL for web search |

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** JavaScript (no TypeScript in main app)
- **UI:** Tailwind CSS 4, Framer Motion
- **Database:** SQLite (better-sqlite3)
- **Auth:** NextAuth v5 Beta (GitHub OAuth)
- **AI:** GitHub Copilot (embedded client)
- **Icons:** Lucide React, Phosphor Icons

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Troubleshooting

### AI Chat Not Working

- Check `GITHUB_TOKEN` is set in `.env`
- Verify you have active GitHub Copilot subscription
- See [COPILOT_SETUP.md](./COPILOT_SETUP.md) for detailed troubleshooting

### Database Locked

- Close other connections to `better-imdb.db`
- Check file permissions
- Delete `.db-shm` and `.db-wal` files if corrupted

### Build Errors

```bash
# Clear cache and rebuild
rm -rf .next
npm run build
```

## License

MIT License - see LICENSE file for details

## Support

- 📖 Documentation: [COPILOT_SETUP.md](./COPILOT_SETUP.md)
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions
