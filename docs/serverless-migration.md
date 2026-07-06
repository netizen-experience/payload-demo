# Serverless Migration Notes (AWS + IaC)

**Status**: Phases 1-3 complete (DB adapter swap, media → S3, staging infra live on Lambda/CloudFront). Phase 4 (Cron) dropped — scheduled publishing was removed from the app entirely (see note below) rather than ported to EventBridge. Phase 5 not started.
**Recommendation**: Migrate. Low/spiky traffic + cost-driven motivation is a good fit for serverless, and this app is already close to serverless-ready.

## History note

While starting Phase 2, we found real AWS infrastructure (an Aurora Postgres cluster, a VPC, and an S3 bucket, all tagged `sst:app=payload-demo`/`sst:stage=prod`) left running from an **earlier, separate attempt** at this migration using SST + OpenNext, which hit a real blocker (Turbopack hashes native modules like `sharp` with random suffixes, breaking Lambda cold-start module resolution) and was abandoned — that code was `git reset` out of history and isn't reachable from any branch. The AWS resources it created were never torn down and the Aurora cluster was actively billing. We tore all of it down by hand (SST's own state had no record of these resources, so `sst remove` couldn't do it) before proceeding with a fresh, independent S3 bucket for Phase 2. If you're planning Phase 3's IaC from scratch, there's no leftover infra to reconcile with — start clean.

## Phase 3 prep: Next.js 16 → 15.4.11 downgrade

Before restarting Phase 3, we downgraded Next.js from 16.2.3 to 15.4.11 to directly address the blocker that killed the earlier abandoned attempt (see History note above): Next 16 makes Turbopack mandatory for `next build`, and Turbopack hashes native modules like `sharp` with random suffixes, breaking Lambda cold-start module resolution under OpenNext. On 15.4.11, `next build` defaults back to webpack, avoiding the issue entirely — verified by confirming the build banner shows no `(Turbopack)` tag.

This was **not** blocked by Payload's peer dependency, despite an initial (incorrect) web search suggesting otherwise — Payload 3.82.1 explicitly allows `>=15.4.11 <15.5.0`, and 15.4.11 is the latest release in that window. Two real breaking changes surfaced only during implementation (not caught by pre-downgrade research): `revalidateTag`'s two-argument form is Next-16-only, and `eslint-config-next`'s flat-config export shape changed between 15 and 16. Both are documented in detail, along with every other version constraint checked, in [docs/nextjs-version-compatibility.md](nextjs-version-compatibility.md) — check that file before any future Next.js/Payload/React version change.

## Phase 3: what actually shipped, and what changed from the original plan

The staging deployment is live at `https://dtgicslfgxmeh.cloudfront.net` — this is the first time this migration effort has gotten a working Next.js app onto Lambda; the earlier abandoned attempt never got past the Turbopack/sharp bundling failure. Real infra (`sst.config.ts`, committed): `sst.aws.Vpc` (no NAT), 4 VPC endpoints (S3 + DynamoDB Gateway, Secrets Manager + SQS Interface), `sst.aws.Aurora` (Postgres, Serverless v2), a private `sst.aws.Bucket`, 3 `sst.Secret`s, a one-off `sst.aws.Function` for running migrations/seed (`infra/migrate-handler.ts`), and `sst.aws.Nextjs` for the app itself.

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
