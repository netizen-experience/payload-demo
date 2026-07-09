# Migration plan: AWS (SST/OpenNext) → Vercel Hobby

**Status**: Not started. This doc is a handoff/planning seed for a new branch forked from `migrate-to-serverless` — written specifically so context isn't lost across a compaction boundary.

## Why

The AWS serverless setup (this branch, fully working) has a real fixed monthly cost floor of roughly **$25-30/month regardless of traffic**, dominated by two VPC Interface endpoints (Secrets Manager + SQS) that exist *purely* so Lambda can reach Aurora privately. Lambda itself, Aurora's ACU-hours, CloudFront, and S3 are all cheap-to-free at this site's actual (low/spiky) traffic — the VPC is the expensive part, and it exists only because of the "private database" networking requirement.

Vercel Hobby (free tier) + a managed Postgres provider (Neon/Supabase, also free-tier) eliminates that VPC requirement entirely: Vercel's serverless functions reach the database over the public internet, no private networking needed. The client for this project isn't being charged (explicitly confirmed by the user), so Vercel Hobby's non-commercial-use restriction is a non-issue here.

This is a genuinely low-effort migration compared to switching CMS platforms (Sanity/Contentful/etc., discussed and rejected earlier) — **Payload itself doesn't change at all**, only the hosting target. The original Payload website template this project is built from was actually designed with Vercel in mind (see "Already-present Vercel awareness" below) — today's AWS/SST work was a deliberate detour to demonstrate/exercise a different deployment pattern, not a sign that Vercel wouldn't work.

## Current state (as of branching)

Fully working, deployed, and verified on AWS:
- **Live URL**: `https://payload-demo.netizenexperience.com` (custom domain via Route53 zone `Z06693953EJ4NP2ZAD3IE`, ACM cert, CloudFront distribution `E2ML405UITKU2W` / `dtgicslfgxmeh.cloudfront.net`)
- **Database**: Aurora Postgres Serverless v2, auto-pause, host `payload-demo-staging-mydatabasecluster-dcvxvcrk.cluster-cxiauwys0n6c.ap-southeast-1.rds.amazonaws.com`
- **Media**: private S3 bucket `payload-demo-staging-mediabucketbucket-huvnzham` (staging) — also a separate older bucket `payload-demo-media-263078047633` that local dev points at
- **Compute**: Lambda via OpenNext (`sst.aws.Nextjs`), migrate/restore Lambda (`payload-demo-staging-MigrateFunctionFunction-uddawfnr`)
- **IaC**: `sst.config.ts` + `infra/` (SST Ion / Pulumi), IAM policies in `infra/developers-compute.json` + `infra/developers-storage.json` for a scoped "Developers" permission set (AWS account `263078047633`, region `ap-southeast-1`, profile `nx-self-hosting-devs-sst`)
- **e2e verification**: `npm run test:e2e:staging` (`tests/e2e-staging/`, `playwright.staging.config.ts`) — 4/4 passing, uses account `staging-e2e-test@example.com` / `StagingE2ETest123!`
- **App version state**: Payload 3.82.1, Next.js **15.4.11** (downgraded from 16.2.3 — see below), scheduled publishing/jobs queue **removed entirely** (unused feature, ripped out rather than ported)

Full narrative of how all of the above was built, including every bug hit and fixed, is in `docs/serverless-migration.md` — that doc is the AWS-specific history and is **not** being deleted; this new doc is forward-looking for the Vercel branch specifically.

## Load-bearing technical context from the AWS work

These are things learned the hard way this session that should directly inform (or be re-verified against) the Vercel plan — not just "for the record."

### Things that were AWS/Lambda-specific and likely don't apply on Vercel (re-verify, don't assume fixed)

- **Next.js 16 → 15.4.11 downgrade**: caused by Turbopack (mandatory in Next 16's `next build`) hashing `sharp`'s native binary with random suffixes, breaking **Lambda** cold-start module resolution under **OpenNext**. This was specifically about OpenNext's Lambda bundling, not Next.js itself. Vercel is Next.js's own platform and handles native module bundling through a completely different pipeline — **Next 16 may well be fine on Vercel**. Worth actively re-testing rather than assuming the downgrade must persist. Full compatibility checklist either way: `docs/nextjs-version-compatibility.md`.
- **The entire image-loading saga** (relative-vs-absolute media URLs, `remotePatterns` allowlist, `NEXT_PUBLIC_SERVER_URL` chicken-and-egg, image-optimizer IAM permissions) was fundamentally about OpenNext's Lambda image-optimizer having exactly two paths for a `next/image` src (absolute URL → HTTP fetch, anything relative → S3 key lookup, no fallback) — this is an **OpenNext** implementation detail, not a Next.js one. Vercel has **native, first-party** image optimization for `next/image` with no equivalent split. The current code (`src/utilities/getMediaUrl.ts` always returning absolute URLs, `next.config.ts`'s `remotePatterns`) will likely still work fine on Vercel (absolute URLs are always safe), but the *reason* it was necessary won't exist there — don't be surprised if it turns out to be unnecessary complexity in hindsight.
- **`payload.db.migrate()` failing inside the migrate Lambda specifically** (`ERR_REQUIRE_ESM` loading dynamically-imported `.ts` migration files — confirmed the *exact same call* works fine locally on the same Node version) was never root-caused; documented as a known-broken, non-fatal-by-design workaround in `infra/migrate-handler.ts`. This whole mechanism (a dedicated VPC-attached Lambda just to reach a private database) goes away entirely on Vercel — migrations would run some other way (Vercel build step, or a plain script run against a publicly-reachable Neon/Supabase instance from a local machine or CI). This bug is very unlikely to resurface, but if something *does* look like ESM/CJS interop weirdness when running migrations post-migration, this is the precedent to remember.
- **Lambda's 6MB synchronous response/request payload limit** drove re-encoding the seed dish photos from 7-8.5MB PNGs to ~0.25-0.4MB JPEGs (`scripts/optimize-seed-photos.ts`). Vercel has its own function payload limits (check current values — they've historically been more generous than 6MB, and Vercel doesn't buffer `next/image` originals through a Lambda-style optimizer the same way). Keeping photos small is good practice regardless of platform, so this fix carries over as a win either way, but the specific 6MB ceiling that forced it may not apply.

### Things that are genuinely platform-independent and carry over as-is

- **Jobs queue / scheduled publishing removal** — an app-level product decision (nobody used it), unrelated to hosting platform. Stays removed.
- **`dangerouslyAllowSVG` / SVGs rendered `unoptimized`** — a Next.js framework-level default (XSS safeguard), not an OpenNext or AWS thing. Applies identically on Vercel.
- **Local dev workflow, Payload collections/config, seed script, DB schema/migrations** — none of this changes. Payload itself is completely portable; only its `db` adapter's connection string and the `storage-s3` plugin's credential source change.
- **The `scripts/export-local-db-for-staging.ts` + `infra/db-restore.ts` pair** (topological-sort-aware, enum-safety-checked table restore, built for pushing local Postgres into a VPC-private Aurora via Lambda) is **directly reusable, and much simpler to use**, for seeding a new Neon/Supabase database — since that target is publicly reachable, you can skip the whole "export to S3, invoke a Lambda, have the Lambda read it back" dance and just connect `pg.Client` directly from a local script. The restore logic in `infra/db-restore.ts` (truncate + FK-safe reload + sequence reset) is the reusable core; only the transport mechanism simplifies.

### Already-present Vercel awareness in this codebase

Not something built this session — pre-existing in the template, but directly relevant:
- `next.config.ts` and `src/utilities/getURL.ts` both already check `process.env.VERCEL_PROJECT_PRODUCTION_URL` as a first-class case (falls back to it before other env vars). Vercel sets this automatically at both build and runtime — meaning the `NEXT_PUBLIC_SERVER_URL` chicken-and-egg problem that required hardcoding the CloudFront domain in `sst.config.ts` **may not need any manual domain-hardcoding at all on Vercel** — worth confirming this resolves automatically before porting over any of that hardcoding.

## Known unknowns to verify early (before assuming the plan is solid)

- **Vercel Hobby serverless function duration limit** (historically 10s default on Hobby) — check against anything slow: admin operations, first-hit cold connection to a paused Neon compute.
- **Neon/Supabase free-tier limits** — storage cap, compute-hour cap, auto-suspend behavior/cold-resume latency (compare against Aurora's observed 10-55s cold-resume, which caused real pain this session — if Neon's is meaningfully faster, that's a strict improvement).
- **Media storage decision**: keep the existing S3 bucket (Payload's `storage-s3` plugin works fine over the public internet, no VPC needed on Vercel either way) vs. switch to Vercel Blob. If keeping S3, Vercel functions need **real AWS credentials** (static access key, or check if Vercel has an OIDC/role-assumption integration) since there's no Lambda execution role to inherit from — this is a real difference from the current AWS setup's credential model.
- **Whether Next.js 16 is viable now** — actually test it on Vercel rather than assuming the 15.4.11 pin must persist.

## Rough checklist (not yet executed — this is a plan, not a log)

1. Pick managed Postgres (Neon vs Supabase) — compare free-tier limits.
2. Decide media storage (keep S3 vs Vercel Blob).
3. Create Vercel project, link to a `main`/new branch.
4. Env vars: `DATABASE_URL` (new provider), `PAYLOAD_SECRET`, `PREVIEW_SECRET`, and (if keeping S3) `S3_BUCKET`/`S3_REGION`/AWS credentials.
5. Seed/restore data into the new Postgres — reuse `scripts/export-local-db-for-staging.ts` + `infra/db-restore.ts`'s restore logic, simplified for direct connection (no Lambda hop needed).
6. Re-verify image loading end-to-end on Vercel before assuming any of the `getMediaUrl`/`remotePatterns` complexity is still needed.
7. Re-verify Next.js 16 upgrade feasibility now that OpenNext/Lambda bundling isn't in the picture.
8. Custom domain on Vercel (native support, likely far simpler than the Route53/ACM dance in `sst.config.ts`).
9. Point `playwright.staging.config.ts` / `tests/e2e-staging` at the new URL once live; confirm the same 4 tests still pass.
10. Once Vercel is confirmed fully working: decommission the AWS stack (`npx sst remove --stage staging`, plus the manually-created `payload-demo-media-263078047633` bucket and Route53/ACM resources from before SST managed them) to actually stop paying for it.
11. Decide what happens to `sst.config.ts`, `infra/`, and the AWS-specific scripts (`optimize-seed-photos.ts` stays useful regardless; the SST/Lambda-specific files become dead weight once AWS is decommissioned — don't delete them from git history, but they'd no longer be load-bearing).

## Operational constraints to keep honoring (established this session, still apply)

- Always `npm`, never `pnpm`/`yarn`.
- Never run a deploy without explicit confirmation first.
- Docs go in `docs/`, not repo root.
- Ask before ambiguous or risky choices (this doc exists *because* that pattern surfaced a lot of real decisions worth deliberating, not rushing).
- Only commit/push when explicitly asked to.
