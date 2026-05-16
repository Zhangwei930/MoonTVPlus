# Repository Guidelines

## Project Structure & Module Organization
MoonTVPlus is a Next.js 14 TypeScript app. Routes and API handlers live in `src/app`; shared UI in `src/components`; reusable hooks in `src/hooks`; domain and server utilities in `src/lib`; global styles and themes in `src/styles`; ambient types in `src/types`. Static assets are in `public`. Database migrations are split between `migrations` and `migrations/postgres`. Operational scripts and custom servers live in `scripts`, `server`, and root entrypoints such as `server.js` and `start.js`.

## Build, Test, and Development Commands
Use pnpm 10 as declared in `package.json`.
- `pnpm dev`: regenerate the manifest and run the custom development server.
- `pnpm build`: regenerate the manifest and build the production Next app.
- `pnpm start`: run the production server after a build.
- `pnpm test` / `pnpm test:watch`: run Jest once or in watch mode.
- `pnpm lint`, `pnpm lint:strict`, `pnpm typecheck`, `pnpm format:check`: verify lint, TypeScript, and formatting.
- `pnpm build:cloudflare`, `pnpm preview:cloudflare`, `pnpm deploy:cloudflare`: Cloudflare build, preview, and deploy flow.
- `pnpm init:sqlite`, `pnpm init:postgres`, `pnpm db:reset`: initialize or reset local databases.

## Coding Style & Naming Conventions
TypeScript runs in strict mode. Prefer `@/` for `src` imports and `~/` for `public`. Prettier uses 2 spaces, semicolons, single quotes, and always-parenthesized arrow arguments. ESLint extends Next/core-web-vitals, sorts imports, and warns on unused imports. Components use PascalCase, for example `VideoCard.tsx`; hooks use `useName.ts`; utilities should match nearby file naming.

## Testing Guidelines
Jest is configured through `next/jest` with Testing Library and `jest-environment-jsdom`. Add tests near the changed code or in `__tests__`, named `*.test.ts` or `*.test.tsx`. For features and fixes, write the failing test first, then implement. Cover normal behavior, edge cases, and handled errors; target at least 80% coverage for touched logic.

## Commit & Pull Request Guidelines
Recent history uses short English and Chinese summaries. Keep commits focused and descriptive, preferably `type(scope): summary`, such as `fix(player): prevent stale progress`. PRs should describe user-visible impact, link related issues, list verification commands, and include screenshots for UI changes. Do not commit secrets, generated build output, or local database files.

## Security & Configuration Tips
Keep secrets in local environment files or platform settings only. When changing persistence, review both SQLite and Postgres migrations. Treat media proxying, auth, and token paths carefully: log server-side context, but avoid exposing sensitive details in user-facing errors.
