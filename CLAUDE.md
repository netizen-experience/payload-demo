# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (Next.js + Payload admin at localhost:3000)
npm run build        # Production build (runs next-sitemap post-build)
npm run start        # Start production server
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues

# Payload code generation (run after schema changes)
npm run generate:types       # Regenerate src/payload-types.ts
npm run generate:importmap   # Regenerate app/(payload)/admin/importMap.js

# Type checking
npx tsc --noEmit

# Testing
npm test             # Run both integration and E2E tests
npm run test:int     # Vitest integration tests (tests/int/**/*.int.spec.ts)
npm run test:e2e     # Playwright E2E tests (tests/e2e/)
```

## Restaurant Site: Matsu-Sushi (松壽司)

This is a Japanese sushi restaurant website with dual-language support (English default, Traditional Chinese).

**Key URLs:**
- `/` → redirects to `/en`
- `/en` / `/zh` → homepage
- `/en/menu` / `/zh/menu` → menu listing by category
- `/en/menu/[slug]` / `/zh/menu/[slug]` → individual menu item
- `/en/[slug]` / `/zh/[slug]` → generic CMS pages
- `/admin` → Payload CMS admin panel

**Seed the database** (run once, clears and repopulates all data):
```bash
PAYLOAD_SECRET=80f904adaf380a2865a893f4 DATABASE_URL=file:./payload-demo.db \
node --import tsx/esm -e "
import { getPayload, createLocalReq } from 'payload'
const { default: config } = await import('./src/payload.config.ts')
const payload = await getPayload({ config })
const { seed } = await import('./src/endpoints/seed/index.ts')
await seed({ payload, req: await createLocalReq({}, payload) })
await payload.db.destroy(); process.exit(0)
"
```
Or POST to `/next/seed` while authenticated in the admin panel.

## Architecture

This is a **unified full-stack app**: Payload CMS (backend/admin) + Next.js App Router (frontend) running as a single process.

**Localization:** Payload's built-in `localization` is enabled with `en` (default) and `zh` (Traditional Chinese/Cantonese). Locale is passed to all Payload queries. The frontend uses `[locale]` URL segments. Middleware at `middleware.ts` redirects non-locale paths to `/en/...`.

**Key integration point**: `next.config.ts` wraps Next.js with `withPayload()`. Payload is initialized via `getPayload({ config })` imported from `@payload-config` (alias for `src/payload.config.ts`).

### Route Groups

- `src/app/(frontend)/` — Public website routes (pages, posts, search, sitemaps)
- `src/app/(payload)/` — Payload admin panel and API routes

### New: MenuItems Collection (`src/collections/MenuItems/index.ts`)
Localized fields: `title`, `description`. Non-localized: `price`, `image`, `category`, `featured`, `available`, `allergens`, `slug`. Has versioning/drafts and SEO tab.

### Payload Configuration (`src/payload.config.ts`)

- **Database**: SQLite via `DATABASE_URL` env var
- **Collections**: Pages, Posts, Media, Categories, Users
- **Globals**: Header, Footer
- **Plugins**: Redirects, Nested Docs, SEO, Form Builder, Search
- **Jobs Queue**: Scheduled publishing (requires `CRON_SECRET`)
- **TypeScript output**: `src/payload-types.ts` (auto-generated — do not edit manually)

### Content Architecture

Pages and Posts use a **layout builder** pattern: content is stored as an array of blocks (Hero, Content, Media, CallToAction, Archive) rather than a single rich text field. Both support drafts/versioning with scheduled publishing.

### Path Aliases

- `@/*` → `src/*`
- `@payload-config` → `src/payload.config.ts`

## Critical Payload Patterns

See `AGENTS.md` for comprehensive Payload CMS patterns. The most critical:

**Local API access control** — always set `overrideAccess: false` when passing `user`:
```typescript
// ❌ Access control bypassed (runs as admin)
await payload.find({ collection: 'posts', user: someUser })

// ✅ Enforces user permissions
await payload.find({ collection: 'posts', user: someUser, overrideAccess: false })
```

**Transaction safety in hooks** — always pass `req` to nested operations:
```typescript
// ✅ Same transaction
await req.payload.create({ collection: 'audit-log', data: {...}, req })
```

**After schema changes**: run `npm run generate:types` then `npm run generate:importmap`.

## Environment Variables

See `.env.example`:
- `DATABASE_URL` — SQLite file path
- `PAYLOAD_SECRET` — JWT encryption key
- `NEXT_PUBLIC_SERVER_URL` — e.g. `http://localhost:3000`
- `CRON_SECRET` — for scheduled publishing
- `PREVIEW_SECRET` — for draft preview URLs
