# Migration plan: AWS (SST/OpenNext) → Vercel Hobby

**Status**: Planned, not yet executed. All open decisions below are now resolved (research done, options compared) — this is a concrete, phased, ready-to-execute plan. Execution deliberately deferred to a future session on the `migrate-to-vercel-hobby` branch (forked from `migrate-to-serverless`).

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
- **Lambda's 6MB synchronous response/request payload limit** drove re-encoding the seed dish photos from 7-8.5MB PNGs to ~0.25-0.4MB JPEGs (`scripts/optimize-seed-photos.ts`). Vercel's own function body-size cap is 4.5MB (confirmed, a separate limit, still current) — the re-encoded photos (all under 1MB) comfortably clear this too, so no new work needed, just note the reason changes slightly. This same 278MB-total media library is also what makes Vercel Blob's 1GB free tier viable now (see Decisions below) — it would not have fit before this re-encoding.

### Things that are genuinely platform-independent and carry over as-is

- **Jobs queue / scheduled publishing removal** — an app-level product decision (nobody used it), unrelated to hosting platform. Stays removed.
- **`dangerouslyAllowSVG` / SVGs rendered `unoptimized`** — a Next.js framework-level default (XSS safeguard), not an OpenNext or AWS thing. Applies identically on Vercel.
- **Local dev workflow, Payload collections/config, seed script, DB schema/migrations** — none of this changes. Payload itself is completely portable; only its `db` adapter's connection string and the `storage-s3` plugin's credential source change.
- **The `scripts/export-local-db-for-staging.ts` + `infra/db-restore.ts` pair** (topological-sort-aware, enum-safety-checked table restore, built for pushing local Postgres into a VPC-private Aurora via Lambda) is **directly reusable, and much simpler to use**, for seeding a new Neon/Supabase database — since that target is publicly reachable, you can skip the whole "export to S3, invoke a Lambda, have the Lambda read it back" dance and just connect `pg.Client` directly from a local script. The restore logic in `infra/db-restore.ts` (truncate + FK-safe reload + sequence reset) is the reusable core; only the transport mechanism simplifies.

### Already-present Vercel awareness in this codebase

Not something built this session — pre-existing in the template, but directly relevant:
- `next.config.ts` and `src/utilities/getURL.ts` both already check `process.env.VERCEL_PROJECT_PRODUCTION_URL` as a first-class case (falls back to it before other env vars). Vercel sets this automatically at both build and runtime — meaning the `NEXT_PUBLIC_SERVER_URL` chicken-and-egg problem that required hardcoding the CloudFront domain in `sst.config.ts` **may not need any manual domain-hardcoding at all on Vercel** — worth confirming this resolves automatically before porting over any of that hardcoding.

## Decisions (resolved — reasoning kept so it doesn't need re-litigating at execution time)

- **Postgres: Neon**, not Supabase. Neon has native Vercel Marketplace integration (auto-injects connection env vars, can branch a database per preview deployment) and scales-to-zero with ~500ms-2s cold resume — a strict improvement over Aurora's observed 10-55s. Supabase's free tier fully **pauses after 7 days of inactivity and requires a human to manually unpause it via their dashboard** — a categorically worse failure mode than Aurora ever had, for a site that could plausibly go quiet for a week. (Numeric specifics are provider-published and change without notice — re-verify against Neon's current pricing page at signup, don't treat them as locked in.)
- **Media: Vercel Blob**, not S3. `@payloadcms/storage-vercel-blob` is an official Payload plugin (same lineage as `storage-s3` already in use). Confirmed config API: `vercelBlobStorage({ collections: { media: true }, token: process.env.BLOB_READ_WRITE_TOKEN })`. Current total media is **278MB** (confirmed via `aws s3 ls --summarize`) — comfortably inside Blob's 1GB Hobby free tier (10GB transfer/month), which is only true because of the photo re-encoding work already done. Switching removes AWS from the Vercel deployment entirely — no OIDC, no IAM role trust policy, no static keys, no ongoing AWS bill for media. `BLOB_READ_WRITE_TOKEN` is auto-injected by Vercel when the store is added to the project. Real risk to know: Hobby's Blob store **pauses** (not billed overage) if the free limits are exceeded — a hard failure, not a gentle one; unlikely at this traffic level but worth monitoring if the media library grows.
  - Blob URLs are **public and absolute** (`https://<store-id>.public.blob.vercel-storage.com/<filename>`), unlike S3's proxied `/api/media/file/...` pattern — this actually simplifies the AWS-era `getMediaUrl`/`remotePatterns` situation rather than complicating it. `next.config.ts`'s `remotePatterns` will need to allow this Blob domain.
- **Next.js 16 upgrade: explicitly out of scope for this migration.** Conflating "did the hosting move break something" with "did the framework upgrade break something" makes root-causing either one harder. Revisit as its own follow-up once Vercel is stable — `docs/nextjs-version-compatibility.md` already has the re-check procedure ready.
- **Domain cutover: direct, no rehearsal subdomain.** Once a Vercel preview deployment is fully validated (Playwright green, no CORS issues — see risk below), assign the real custom domain and flip DNS in one step. Acceptable given this is a demo with no real downtime cost.
- **A real risk not present in the AWS setup, found during planning**: `getServerSideURL()`/`getClientSideURL()` (`src/utilities/getURL.ts`) fall back to `VERCEL_PROJECT_PRODUCTION_URL`, which resolves to the *production* domain even when testing a *preview* deployment's own unique URL. Three consumers: `payload.config.ts`'s `cors: [getServerSideURL()]`, `plugins/index.ts`'s SEO `generateURL`, and `next.config.ts`'s `remotePatterns` (baked at build time). If a preview's actual browser origin differs from the resolved production hostname, Payload's CORS allowlist may reject the preview's own admin/API calls. **Explicitly check the browser console for CORS errors on the preview URL's `/admin/login`** during execution — don't just check that pages render.

## Phased execution plan

**Phase 1 — Provision Neon + Vercel project shell** (no app code changes)
Create a Neon project standalone first (cleaner for local testability), then the Vercel project linked to this branch. In the Vercel dashboard, add the Neon integration (link the existing project, don't create a new one) and add a Blob store. Record the exact env var names each auto-injects. Exit criteria: both projects exist, env var names known, nothing wired into the app yet.

**Phase 2 — Migrate database to Neon**
Point local `.env`'s `DATABASE_URL` at Neon temporarily, run `npx payload migrate` against it (also validates migrations run fine as a plain script against a public DB — sidesteps the unresolved `ERR_REQUIRE_ESM` migrate-Lambda bug entirely, since that only existed because Aurora was VPC-private). Check if Neon's TLS cert is publicly trusted (likely yes) to drop the `sslmode=no-verify` workaround. Write a new script combining `scripts/export-local-db-for-staging.ts`'s export query with `infra/db-restore.ts`'s exported `restoreDatabase(client, dataByTable)`, connected directly to Neon via `pg.Client` — no S3/Lambda hop needed since both ends are now publicly reachable. Verify: row counts match, `npm run dev` locally against Neon works end-to-end.

**Phase 3 — Migrate media to Vercel Blob**
Add `@payloadcms/storage-vercel-blob`; in `src/plugins/index.ts`, replace the `s3Storage({...})` block with `vercelBlobStorage({ collections: { media: true }, token: process.env.BLOB_READ_WRITE_TOKEN })`. One-time copy of the 278MB/272 objects from S3 to Blob via a new script using `@vercel/blob`'s `put()` API (reuses the same iterate-and-transfer shape as prior `aws s3 sync` work). Update `media` table rows' `url` field to the new Blob URLs (same DB-update pattern as `scripts/optimize-seed-photos.ts`). Update `next.config.ts`'s `remotePatterns` for the Blob domain. Verify: `npm run dev` locally against Neon + Blob, images load, zero AWS involvement in local dev.

**Phase 4 — Deploy to Vercel, re-verify behavior, re-point Playwright**
Set remaining env vars (`PAYLOAD_SECRET`, `PREVIEW_SECRET`). Deliberately do **not** set `NEXT_PUBLIC_SERVER_URL` yet — tests whether the existing `VERCEL_PROJECT_PRODUCTION_URL` fallback makes manual hardcoding unnecessary (unlike AWS's chicken-and-egg problem). Push the branch, get the automatic preview deployment. Verify in order: preview loads; **no CORS errors in the browser console on `/admin/login`** (the flagged risk); an image round-trips Blob → image optimizer → browser; `sharp` resolves correctly for admin uploads. Re-point and run `STAGING_URL=<preview-url> STAGING_TEST_EMAIL=... STAGING_TEST_PASSWORD=... npm run test:e2e:staging` — `tests/e2e-staging/smoke.e2e.spec.ts` makes no AWS-specific assumptions, should be a drop-in re-point. Exit criteria: 4/4 Playwright green.

**Phase 5 — Custom domain cutover + AWS decommission**
Assign `payload-demo.netizenexperience.com` as the Vercel project's Production domain; confirm `VERCEL_PROJECT_PRODUCTION_URL` updates to match. Flip Route53 records (zone `Z06693953EJ4NP2ZAD3IE`) from CloudFront to whatever Vercel's domain-verification specifies (check the current exact record type/value at cutover time). Re-run Playwright against the live production domain. Decommission: `npx sst remove --stage staging`, plus manual cleanup of the pre-existing, non-SST-managed `payload-demo-media-263078047633` bucket. Confirm via AWS Cost Explorer a day or two later that the VPC-endpoint cost floor actually stops. Leave `sst.config.ts`/`infra/`/AWS-specific scripts in git history — they become non-load-bearing, not deleted, as part of this migration.

### Files touched across the plan
- `src/plugins/index.ts` — swap `s3Storage` for `vercelBlobStorage`
- `next.config.ts` — `remotePatterns` update for the Blob domain
- `package.json` — add `@payloadcms/storage-vercel-blob`, remove `@payloadcms/storage-s3` once confirmed unused
- New scripts: a Neon export/restore script (Phase 2), a Blob media-transfer script (Phase 3)
- `.env` / `.env.example` — new var names for Neon/Blob, remove `S3_BUCKET`/`S3_REGION` once migrated
- No changes expected to `src/payload.config.ts` (adapter stays `postgresAdapter`, just a different `DATABASE_URL`), or to `playwright.staging.config.ts`/`tests/e2e-staging` (env-driven, just re-pointed at execution time)

## Operational constraints to keep honoring (established this session, still apply)

- Always `npm`, never `pnpm`/`yarn`.
- Never run a deploy without explicit confirmation first.
- Docs go in `docs/`, not repo root.
- Ask before ambiguous or risky choices (this doc exists *because* that pattern surfaced a lot of real decisions worth deliberating, not rushing).
- Only commit/push when explicitly asked to.
