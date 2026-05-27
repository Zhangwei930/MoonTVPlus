# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use `pnpm` (v10) for all package management.

```bash
pnpm dev                  # regenerate manifest + start custom dev server (server.js)
pnpm build                # regenerate manifest + next build
pnpm start                # production server after build
pnpm test                 # run Jest once
pnpm test:watch           # Jest in watch mode
pnpm lint                 # ESLint
pnpm lint:strict          # ESLint with zero warnings tolerance
pnpm typecheck            # tsc --noEmit
pnpm format:check         # Prettier check
pnpm build:cloudflare     # Cloudflare Workers build via OpenNext
pnpm deploy:cloudflare    # wrangler deploy
pnpm init:sqlite          # initialize local SQLite database
pnpm db:reset             # drop and reinitialize SQLite (.data/moontv.db)
```

Run a single test file: `pnpm test -- path/to/file.test.ts`

## Architecture

MoonTVPlus is a **Next.js 14 App Router** media aggregator. It proxies multiple third-party CMS V10 video APIs, enriches metadata from Douban/TMDB, and stores user data (favorites, play records) in a pluggable backend.

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js pages and API routes (App Router) |
| `src/app/api/` | ~40+ API route handlers (search, auth, proxy, cron, etc.) |
| `src/components/` | Shared React components |
| `src/lib/` | All server-side domain logic and storage adapters |
| `src/hooks/` | Custom React hooks |
| `src/types/` | Ambient TypeScript declarations |
| `server/` | Standalone WebSocket watch-room server |
| `scripts/` | One-off scripts: manifest generation, DB initialization |
| `migrations/` | SQLite migration files (numbered SQL); `migrations/postgres/` for Postgres |
| `public/` | Static assets (use `~/` alias) |

### Storage layer (`src/lib/db.ts`)

The `IStorage` interface in `src/lib/types.ts` defines the contract for all persistence. `src/lib/db.ts` selects the implementation at runtime via `NEXT_PUBLIC_STORAGE_TYPE`:

- `redis` → `RedisStorage` (redis.db.ts)
- `kvrocks` → `KvrocksStorage` (kvrocks.db.ts)
- `upstash` → `UpstashRedisStorage` (upstash.db.ts)
- `d1` → `D1Storage` (d1.db.ts) — SQLite locally, Cloudflare D1 in production; server-side only
- `postgres` → `PostgresStorage` (postgres.db.ts) — server-side only

When adding features that persist data, implement them in all relevant storage adapters and add a SQLite migration under `migrations/`.

### Configuration (`src/lib/config.ts`)

Runtime site config (video sources, live channels, categories) is stored in the database and loaded by `config.ts`. The config file format uses `api_site` keys mapped to CMS V10 API endpoints. Config can also be bootstrapped from the `INIT_CONFIG` env var or a `CONFIG_SUBSCRIPTION_URL`.

### Auth (`src/lib/auth.ts`, `src/lib/middleware-auth.ts`)

Three roles: `owner`, `admin`, `user`. Auth tokens are JWT-like, stored as cookies. The `owner` is the deployer (set by `USERNAME`/`PASSWORD` env vars). OIDC is supported via `src/app/api/auth/oidc/`.

### Video playback pipeline

1. **Search**: `src/app/api/cms-proxy/` fans out to all configured `api_site` endpoints
2. **Detail**: `src/lib/fetchVideoDetail.ts` + `src/lib/special-sources-detail.ts` for sites needing HTML scraping
3. **Player**: ArtPlayer + HLS.js in `src/components/`, with optional Anime4K WebGPU upscaling
4. **Danmaku**: proxied through `src/app/api/danmaku/` to an external danmu_api backend
5. **Ad-skip**: `src/lib/episode-filter.ts` + custom user scripts via `src/lib/source-script.ts`

### Watch Room

Real-time multi-user watch rooms use Socket.IO. The server runs either:
- **Internal**: `src/lib/watch-room-server.ts` attached to `server.js`
- **External**: a standalone `server/watch-room-standalone-server.js` process

Controlled by `WATCH_ROOM_ENABLED` and `WATCH_ROOM_SERVER_TYPE` env vars.

### Cloudflare Workers deployment

Uses `@opennextjs/cloudflare`. The `open-next.config.ts` and `wrangler.toml` configure this. D1 is the only supported storage backend on Workers. Build with `pnpm build:cloudflare`.

## Code conventions

- **Imports**: `@/` for `src/`, `~/` for `public/`. ESLint enforces sorted imports and warns on unused imports.
- **Formatting**: Prettier — 2 spaces, single quotes, semicolons, trailing commas.
- **TypeScript**: strict mode. Avoid `any`; when unavoidable, use `eslint-disable` on the specific line.
- **Components**: PascalCase filenames. Hooks: `useName.ts`. Utilities match nearby file naming.
- **Tests**: Jest + Testing Library + jsdom. Test files: `*.test.ts` / `*.test.tsx`, placed near the source or in `src/__tests__/`.

## Environment variables

Minimum required to run locally:

```env
USERNAME=admin
PASSWORD=yourpassword
NEXT_PUBLIC_STORAGE_TYPE=d1   # or redis/kvrocks/upstash/postgres
```

See README.md for the full list of ~40 env vars.
