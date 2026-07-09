# Serverless Migration Notes (AWS + IaC)

**Status**: Phases 1-3 complete (DB adapter swap, media → S3, staging infra live on Lambda/CloudFront). Phase 4 (Cron) dropped — scheduled publishing was removed from the app entirely (see note below) rather than ported to EventBridge. Phase 5 not started.
**Recommendation**: Migrate. Low/spiky traffic + cost-driven motivation is a good fit for serverless, and this app is already close to serverless-ready.

## History note

While starting Phase 2, we found real AWS infrastructure (an Aurora Postgres cluster, a VPC, and an S3 bucket, all tagged `sst:app=payload-demo`/`sst:stage=prod`) left running from an **earlier, separate attempt** at this migration using SST + OpenNext, which hit a real blocker (Turbopack hashes native modules like `sharp` with random suffixes, breaking Lambda cold-start module resolution) and was abandoned — that code was `git reset` out of history and isn't reachable from any branch. The AWS resources it created were never torn down and the Aurora cluster was actively billing. We tore all of it down by hand (SST's own state had no record of these resources, so `sst remove` couldn't do it) before proceeding with a fresh, independent S3 bucket for Phase 2. If you're planning Phase 3's IaC from scratch, there's no leftover infra to reconcile with — start clean.

## Phase 3 prep: Next.js 16 → 15.4.11 downgrade

Before restarting Phase 3, we downgraded Next.js from 16.2.3 to 15.4.11 to directly address the blocker that killed the earlier abandoned attempt (see History note above): Next 16 makes Turbopack mandatory for `next build`, and Turbopack hashes native modules like `sharp` with random suffixes, breaking Lambda cold-start module resolution under OpenNext. On 15.4.11, `next build` defaults back to webpack, avoiding the issue entirely — verified by confirming the build banner shows no `(Turbopack)` tag.

This was **not** blocked by Payload's peer dependency, despite an initial (incorrect) web search suggesting otherwise — Payload 3.82.1 explicitly allows `>=15.4.11 <15.5.0`, and 15.4.11 is the latest release in that window. Two real breaking changes surfaced only during implementation (not caught by pre-downgrade research): `revalidateTag`'s two-argument form is Next-16-only, and `eslint-config-next`'s flat-config export shape changed between 15 and 16. Both are documented in detail, along with every other version constraint checked, in [docs/nextjs-version-compatibility.md](nextjs-version-compatibility.md) — check that file before any future Next.js/Payload/React version change.

## Phase 3: what actually shipped, and what changed from the original plan

The staging deployment is live at `https://payload-demo.netizenexperience.com` (originally the auto-generated `dtgicslfgxmeh.cloudfront.net`, moved to this custom domain once image loading needed a stable domain known ahead of build time — see "Custom domain" below) — this is the first time this migration effort has gotten a working Next.js app onto Lambda; the earlier abandoned attempt never got past the Turbopack/sharp bundling failure. Real infra (`sst.config.ts`, committed): `sst.aws.Vpc` (no NAT), 4 VPC endpoints (S3 + DynamoDB Gateway, Secrets Manager + SQS Interface), `sst.aws.Aurora` (Postgres, Serverless v2), a private `sst.aws.Bucket`, 3 `sst.Secret`s, a one-off `sst.aws.Function` for running migrations/seed (`infra/migrate-handler.ts`), and `sst.aws.Nextjs` for the app itself.

A few decisions changed from the original plan, all for reasons discovered during implementation, not upfront guesses:

- **Database: Aurora Serverless v2, not plain RDS.** The original recommendation (plain `db.t4g.micro` RDS, cheaper than Aurora's fixed ACU floor) assumed Aurora bills continuously. It doesn't — Serverless v2 auto-pauses to near-zero compute cost after 5 min idle (`scaling: { min: '0 ACU', max: '2 ACU', pauseAfter: '5 minutes' }`), which is cheaper than a fixed instance for a mostly-idle staging environment, and Aurora is also an SST-native component (no hand-wiring a DB subnet group/security group the way a raw `aws.rds.Instance` needs). Tradeoff: a cold request after a full pause can take 10-50+ seconds to resume — see the timeout note below.
- **Frontend pages switched from static generation to `force-dynamic`.** `/posts`, `/posts/[slug]`, `/[locale]/[slug]`, `/[locale]/menu/[slug]`, and `/posts/page/[pageNumber]` all used `generateStaticParams`/`force-static`, which need a live DB connection *during `next build`*. Aurora is deliberately private-VPC-only, so the machine running the build can't reach it — this is the exact problem the abandoned attempt already solved (its own commit history mentions "force-dynamic pages for Aurora VPC"). No caching benefit for these routes now; acceptable for a low-traffic site, and CloudFront can still cache at the edge later if needed.
- **Server function timeout bumped to 55s** (`server.timeout`, SST default is 20s) — an Aurora cold-resume can exceed 20s, and 55s stays under CloudFront's own 60s response limit.

## Why migrate

- Currently self-managed Docker/VM hosting, paying for always-on compute against low/spiky traffic.
- App is fundamentally stateless: no websockets, no in-memory caches, no custom server, no long-running background workers.
- Already builds with `output: standalone` ([next.config.ts](../next.config.ts)) — the ideal starting point for Lambda-based deployment.

## Current architecture snapshot

(Will change during migration — recorded here for reference.)

- **Database**: Postgres via `@payloadcms/db-postgres` (as of Phase 1), local dev via Docker (`docker-compose.yml`), schema managed via explicit migrations in `src/migrations/` (`push: false`) — [src/payload.config.ts](../src/payload.config.ts)
- **Media storage**: S3 via `@payloadcms/storage-s3` (as of Phase 2), private bucket — files are served through Payload's own `/api/media/file` route, which proxies to S3 server-side, so no bucket policy or CDN is required yet — [src/plugins/index.ts](../src/plugins/index.ts)
- **Hosting**: Docker / docker-compose, Next.js `standalone` output, port 3000

## Scheduled publishing: removed, not ported

The template shipped with `schedulePublish: true` on Pages/Posts/MenuItems, backed by Payload's jobs queue and a `CRON_SECRET`-gated run endpoint. That feature needed something to poll the run endpoint on a schedule — no always-on process exists in Lambda, so the original plan (Phase 4) was to point an EventBridge Scheduler rule at it. Since nobody was actually using "schedule for later" in the admin panel, we removed the feature outright instead of standing up EventBridge for it: `schedulePublish` off on all three collections, the `jobs`/`CRON_SECRET` config dropped from `payload.config.ts`, and the `payload_jobs`/`payload_jobs_log` tables dropped via migration `20260706_084436_remove_jobs_queue`. If scheduled publishing is needed later, re-enable `schedulePublish` on the relevant collections and revisit EventBridge then — see the old Phase 4 plan item below for the shape of that work.

## The two blockers

| Current | Problem on serverless | Fix |
|---|---|---|
| ~~SQLite file~~ (resolved in Phase 1 — now Postgres) | No persistent local disk between invocations | Point `@payloadcms/db-postgres` at a managed Postgres (Aurora Serverless v2 as of Phase 3 — see Target architecture) |
| ~~Local filesystem media~~ (resolved in Phase 2 — now S3) | Filesystem is ephemeral per-invocation | `@payloadcms/storage-s3`, private bucket + Payload's own file-proxy route; CloudFront can front it later without any app changes |

Everything else (routing, RSC, admin panel, REST/GraphQL APIs) runs inside the Next.js request lifecycle and deploys to Lambda unmodified via **OpenNext**.

## Target architecture

- **Compute**: Lambda via OpenNext + CloudFront (`sst.aws.Nextjs`). Not Fargate — Fargate bills for a running task even at zero traffic, which defeats the cost goal for spiky/low traffic.
- **Database**: Aurora Postgres Serverless v2 (`sst.aws.Aurora`), auto-pauses when idle — see the "what changed" note above for why this replaced the originally-planned plain RDS instance.
- **Networking**: single VPC, no NAT Gateway/instance. Lambda reaches AWS services entirely through VPC endpoints — S3 and DynamoDB via free Gateway endpoints, Secrets Manager and SQS via Interface endpoints (small per-AZ + data cost, still far cheaper than NAT). DynamoDB and SQS are needed because OpenNext's ISR/revalidation system uses both internally, even though the app itself doesn't reference either directly — easy to miss if you only think about the app's own AWS dependencies.
- **Media**: S3 + `@payloadcms/storage-s3` adapter. Kept the bucket private and served files through Payload's existing `/api/media/file` proxy route (no app or `next.config.ts` changes needed); CloudFront can be added in front of the same bucket later purely as an infra change.
- **Secrets**: 2 `sst.Secret`s (`PayloadSecret`, `PreviewSecret`), set via `sst secret set --stage staging`. Aurora's own DB credentials are generated and stored internally by the `sst.aws.Aurora` component.
- **Migrations**: no NAT means no network path from a local machine to the private-subnet-only Aurora instance. Solved with a small VPC-attached `sst.aws.Function` (`infra/migrate-handler.ts`) that runs `payload.db.migrate()` (and optionally the seed script), invoked manually via `aws lambda invoke` after any deploy that changes the schema.

## IaC choice

**SST (Ion)**, used as planned — has a ready-made Next.js/OpenNext construct (`sst.aws.Nextjs`) that correctly wires Lambda + CloudFront + image optimization + revalidation, which would be fiddly to hand-roll. It also mixes cleanly with raw Pulumi resources (`aws.ec2.VpcEndpoint`, etc.) in the same config file where SST has no dedicated component. Terraform/CDK remain viable alternatives if org-wide IaC standardization matters more than setup speed, but budget more time for wiring OpenNext's multiple Lambda functions and CloudFront behaviors manually.

### Gotchas worth knowing before touching this stack again

- **`server: { install: [...] }` alone did not get `sharp` into the deployed bundle** — it silently included sharp's pure-JS dependencies but not the native `@img/sharp-*` binaries. Adding a dedicated `open-next.config.ts` with an explicit `install: { packages: ['sharp'], arch: 'x64' }` (matching the deployed function's actual architecture — check via `aws lambda get-function-configuration`) is what worked.
- **Next's `output: standalone` bundles the build machine's `.env` file into the deployment package.** Local `.env` has `AWS_PROFILE` set for SSO; that profile doesn't exist inside Lambda. `dotenv` only fills in vars *absent* from `process.env`, so any Lambda env var not explicitly set in `sst.config.ts` — like `AWS_PROFILE` — gets silently backfilled from the bundled file at runtime, potentially breaking the AWS SDK's credential resolution (it prefers `AWS_PROFILE` over the execution role's real credentials when both look present). Fixed by explicitly setting `AWS_PROFILE: ''` in the Nextjs component's `environment`.
- **The one-off migration function needed several packages excluded from esbuild bundling** (`nodejs.install`) beyond the obvious ones: `sharp`, `tsx` (Payload dynamically `import()`s raw `.ts` migration files at runtime — needs a TS loader in the Lambda, hence `NODE_OPTIONS: '--import tsx/esm'` too), `@payloadcms/db-postgres`, and `payload` itself (a peer dependency `@payloadcms/drizzle` needs that isn't auto-installed by `nodejs.install`'s isolated resolution). The migration files directory also needs an explicit `copyFiles` entry — esbuild only follows static imports, not files Payload reads from disk at runtime.
- **`payload.db.migrate()` inside the migrate Lambda is currently broken, and non-fatal by design (see `infra/migrate-handler.ts`)** — dynamically importing the auto-generated `.ts` migration files fails with `ERR_REQUIRE_ESM` (`@payloadcms/db-postgres` is pure ESM, no CJS entry at all — checked its `package.json` directly). Confirmed the *exact same* `payload.db.migrate()` call works fine locally on the same Node version, so it's specific to this Lambda's esbuild/`nodejs.install` bundling, not a real schema issue. Tried pinning `runtime` to nodejs20.x, 22.x, and 24.x: only 24.x even gets tsx's ESM loader hook to register (20.x/22.x fail earlier with a raw `Cannot use import statement outside a module` syntax error — tsx never engages at all); 24.x gets further but then hits the `ERR_REQUIRE_ESM` wall. Root cause not yet found — **any genuinely new migration won't actually get applied to a deployed environment until this is fixed**; the handler just logs and continues rather than blocking seed/restore, which don't depend on it.
- **Lambda has a hard 6MB response payload limit for synchronous invocations, and `/api/media/file/<filename>` buffers the whole file into the response.** Correction to an earlier version of this note: the app does **not** use Payload's pre-generated `sizes.*` variants for rendering — `getMediaUrl`/`ImageMedia` always pass the original file's URL to `next/image`, which does its own on-the-fly resizing via OpenNext's image-optimizer. That optimizer fetches the *original* every time regardless of the requested output size, so any original over 6MB breaks image rendering entirely, not just direct links to it. Real fix (not a workaround): the seed dataset's dish photos were lossless PNGs of photographic content at 7-8.5MB each — re-encoded as JPEG capped at 1920px (`scripts/optimize-seed-photos.ts`), down to ~0.25-0.4MB with no visible quality loss.
- **Images were completely broken on the deployed site for reasons layered on top of the above**, found and fixed in this order: (1) `getMediaUrl.ts` returned relative URLs (`/api/media/file/...`) — OpenNext's image-optimizer only has two paths for a src, an absolute `http(s)` URL gets fetched over HTTP, anything relative is *always* treated as an S3 object key with no fallback, so a relative dynamic-route path can never resolve (confirmed via CloudWatch: `NoSuchKey`). Now always returns absolute, via `getClientSideURL()`. (2) `next.config.ts` computed a local variable also named `NEXT_PUBLIC_SERVER_URL` but read it from `VERCEL_PROJECT_PRODUCTION_URL`/`__NEXT_PRIVATE_ORIGIN` instead of the real env var — silently allowed only `localhost` in `remotePatterns`, rejecting the actual deployed domain with `400 "url" parameter is not allowed`. Fixed to read the same env var `getServerSideURL()` does. (3) `NEXT_PUBLIC_SERVER_URL` was never set anywhere in the deploy pipeline — see "Custom domain" below for how this got resolved properly instead of hardcoded. (4) SST's auto-generated IAM role for the image-optimizer function only grants `s3:GetObject` on its assets bucket; the bundled OpenNext handler also does an `s3:ListBucket` call that wasn't covered (`AccessDenied`) — added via `transform.imageOptimizer` in `sst.config.ts`. (5) SVGs are blocked from `next/image` optimization by default (`dangerouslyAllowSVG`) — rendered `unoptimized` for that case specifically instead of opting the whole app out of the safeguard.

## Custom domain

Staging runs on `payload-demo.netizenexperience.com` instead of CloudFront's auto-generated domain, via `sst.aws.Nextjs`'s `domain` option (`dns: sst.aws.dns({ zone: 'Z06693953EJ4NP2ZAD3IE' })` — passed explicitly rather than letting `sst.aws.dns()` suffix-match, since the account has several other `*.netizenexperience.com` hosted zones that could otherwise collide). `payload-demo.netizenexperience.com` has its own dedicated hosted zone, found via `aws route53 list-hosted-zones-by-name`.

This was the real fix for the `NEXT_PUBLIC_SERVER_URL` chicken-and-egg problem noted above: CloudFront's auto-generated domain is only known *after* the resource that needs it (for `remotePatterns`/build-time inlining) is built, so it either has to be hardcoded (fragile — goes stale if the distribution is ever recreated) or you get a stable domain up front by owning it. SST provisions the ACM certificate and DNS records automatically given Route53 write access, which needed two new IAM statements: `route53:ChangeResourceRecordSets`/`ChangeTagsForResource` scoped to that one hosted zone ARN, and `acm:RequestCertificate`/`DeleteCertificate`/`AddTagsToCertificate` (unscoped — no cert ARN exists ahead of creation).

## Restoring local Postgres + media into a deployed environment

One-off tooling (`scripts/export-local-db-for-staging.ts` + `infra/db-restore.ts`, invoked through the same VPC-attached migrate Lambda used for schema migrations, since Aurora has no other reachable path from a local machine) for bringing local dev's database and media bucket content into a deployed environment like staging:

1. `STAGING_MEDIA_BUCKET=<bucket-name> node --import tsx/esm scripts/export-local-db-for-staging.ts` — exports every local Postgres table (same Payload-bookkeeping exclusions as the earlier sqlite migration: `payload_migrations`, preferences, locked-documents, sessions, kv, folders) to a single JSON blob and uploads it to the target's media bucket at `_db-migration/staging-restore-export.json`.
2. `aws lambda invoke --function-name <migrateFunctionName> --payload '{"restore": true, "preserveUserEmail": "<email>"}' ...` — the Lambda downloads that export, truncates the target's top-level tables (`CASCADE` clears every `_locales`/`_rels`/`_v`/`blocks_*` child), reloads in FK-safe order (computed live from the target's own schema, same approach as `scripts/migrate-sqlite-to-postgres.ts`), and — if `preserveUserEmail` is set — snapshots that one user row *before* the wipe and re-inserts it afterward with a fresh id, so a real login (e.g. the `test:e2e:staging` account) survives a full database replace without needing its password reset.
3. Media files: since both buckets are already covered by the same S3 policy statement, just `aws s3 cp`/`sync` the specific files that differ — no Lambda involvement needed, S3-to-S3 is reachable directly.
4. Delete the temp `_db-migration/` export object from the target bucket afterward.

Not wired into `npm run` — one-off tooling, same as the sqlite migration script.

## Verifying a deployed environment: `npm run test:e2e:staging`

A repeatable Playwright suite (`tests/e2e-staging/smoke.e2e.spec.ts`, config in `playwright.staging.config.ts`) replaces the manual curl-based checks used to validate Phase 3. It's a separate command from the regular `test:e2e` — that one always spins up a local dev server; this one only ever talks to a real deployed URL over the network, never starts anything locally.

```bash
STAGING_URL=https://xxxx.cloudfront.net npm run test:e2e:staging
```

Reachability tests (homepage, menu, admin login page) always run and need no credentials. The authenticated test (login → real browser-driven media upload → confirms `sharp` generated size variants → cleans up after itself) needs `STAGING_TEST_EMAIL`/`STAGING_TEST_PASSWORD` for an existing admin account — it's skipped if they're not set, since bootstrapping a user against a locked-down remote API isn't something a test should do automatically.

To create that one-time test account on a fresh deployment (Users collection empty): `POST /api/users/first-register` with `{ email, password }` — this is Payload's own unauthenticated first-user bootstrap endpoint, the same one the admin panel's UI uses when no users exist yet. It won't work once any user already exists.

## Risks / effort notes

- ~~Postgres migration needs validation of all collections end-to-end.~~ Done in Phase 1.
- ~~Media migration requires a one-off script to push `public/media` to S3 and repoint URLs.~~ Done in Phase 2 (`aws s3 sync`, flat key structure matched the existing local layout exactly, no repointing needed).
- Lambda cold starts on the admin panel are the main UX risk — acceptable since it's editor-only traffic, not customer-facing.
- ~~Turbopack hashes sharp's native binary with random suffixes, breaking Lambda cold-start module resolution.~~ Mitigated ahead of Phase 3 by downgrading to Next 15.4.11, where `next build` defaults to webpack — see "Phase 3 prep" above. ~~Sharp needs the correct native-binary architecture for Lambda~~ — done via `open-next.config.ts`'s `install.arch`, matching the deployed function's actual architecture (`x86_64`, not arm64 — verified via `aws lambda get-function-configuration` rather than assumed).

## Phased plan

1. **DB** ✅ done: Swapped DB adapter to Postgres; runs against local/dockerized Postgres (`docker-compose.yml`); schema managed via explicit migrations in `src/migrations/`; seed validated on Pages/Posts/MenuItems.
2. **Media** ✅ done: Added `@payloadcms/storage-s3` (private bucket, served via Payload's own file-proxy route); migrated all 256 existing `public/media` files; new uploads and seed data now go straight to S3. Credentials come from the AWS SDK default provider chain (`AWS_PROFILE` locally, IAM role in prod later) — no static access keys.
3. **Infra** ✅ done: Stood up VPC + VPC endpoints + Aurora Serverless v2 + private S3 bucket + secrets + OpenNext/SST Next.js deployment on `staging`. Verified end-to-end: homepage, menu, and admin login all load through CloudFront; a real image upload through the live admin API correctly triggered `sharp` resizing inside the deployed Lambda (all defined size variants generated and served back through the S3 proxy route) — the exact capability that killed the earlier abandoned attempt. See "what actually shipped" above for the 3 things that changed from the original plan, and "gotchas" for issues that took real debugging (not just infra-as-written) to resolve. This verification is now a repeatable Playwright suite (`npm run test:e2e:staging`, see below) rather than one-off manual checks.
4. ~~**Cron**: Point EventBridge Scheduler at the jobs endpoint; retire the old cron trigger.~~ Dropped — scheduled publishing was removed from the app instead (see "Scheduled publishing: removed, not ported" above). Nothing to schedule.
5. **Cutover**: Switch DNS, monitor, decommission the old VM/Docker host.
