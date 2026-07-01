# Serverless Migration Notes (AWS + IaC)

**Status**: Phases 1-2 complete (DB adapter swap, media → S3). Phases 3-5 not started.
**Recommendation**: Migrate. Low/spiky traffic + cost-driven motivation is a good fit for serverless, and this app is already close to serverless-ready.

## History note

While starting Phase 2, we found real AWS infrastructure (an Aurora Postgres cluster, a VPC, and an S3 bucket, all tagged `sst:app=payload-demo`/`sst:stage=prod`) left running from an **earlier, separate attempt** at this migration using SST + OpenNext, which hit a real blocker (Turbopack hashes native modules like `sharp` with random suffixes, breaking Lambda cold-start module resolution) and was abandoned — that code was `git reset` out of history and isn't reachable from any branch. The AWS resources it created were never torn down and the Aurora cluster was actively billing. We tore all of it down by hand (SST's own state had no record of these resources, so `sst remove` couldn't do it) before proceeding with a fresh, independent S3 bucket for Phase 2. If you're planning Phase 3's IaC from scratch, there's no leftover infra to reconcile with — start clean.

## Why migrate

- Currently self-managed Docker/VM hosting, paying for always-on compute against low/spiky traffic.
- App is fundamentally stateless: no websockets, no in-memory caches, no custom server, no long-running background workers.
- Already builds with `output: standalone` ([next.config.ts](../next.config.ts)) — the ideal starting point for Lambda-based deployment.

## Current architecture snapshot

(Will change during migration — recorded here for reference.)

- **Database**: Postgres via `@payloadcms/db-postgres` (as of Phase 1), local dev via Docker (`docker-compose.yml`), schema managed via explicit migrations in `src/migrations/` (`push: false`) — [src/payload.config.ts](../src/payload.config.ts)
- **Media storage**: S3 via `@payloadcms/storage-s3` (as of Phase 2), private bucket — files are served through Payload's own `/api/media/file` route, which proxies to S3 server-side, so no bucket policy or CDN is required yet — [src/plugins/index.ts](../src/plugins/index.ts)
- **Scheduled publishing**: Payload jobs queue, gated by a `CRON_SECRET` bearer token, triggered externally — [src/payload.config.ts](../src/payload.config.ts)
- **Hosting**: Docker / docker-compose, Next.js `standalone` output, port 3000

## The three blockers

| Current | Problem on serverless | Fix |
|---|---|---|
| ~~SQLite file~~ (resolved in Phase 1 — now Postgres) | No persistent local disk between invocations | Point `@payloadcms/db-postgres` at RDS |
| ~~Local filesystem media~~ (resolved in Phase 2 — now S3) | Filesystem is ephemeral per-invocation | `@payloadcms/storage-s3`, private bucket + Payload's own file-proxy route; CloudFront can front it later without any app changes |
| External process hits jobs endpoint with `CRON_SECRET` | No always-on process to poll | EventBridge Scheduler → same jobs endpoint, same token |

Everything else (routing, RSC, admin panel, REST/GraphQL APIs) runs inside the Next.js request lifecycle and deploys to Lambda unmodified via **OpenNext**.

## Target architecture

- **Compute**: Lambda via OpenNext + CloudFront. Not Fargate — Fargate bills for a running task even at zero traffic, which defeats the cost goal for spiky/low traffic.
- **Database**: RDS Postgres `db.t4g.micro` to start (~$12-15/mo). Cheaper cost floor than Aurora Serverless v2 (min 0.5 ACU ≈ $45+/mo) at this traffic level. Revisit Aurora Serverless v2 only if traffic grows enough to need auto-scaling.
- **Media**: S3 + `@payloadcms/storage-s3` adapter. Phase 2 kept the bucket private and served files through Payload's existing `/api/media/file` proxy route (no app or `next.config.ts` changes needed); CloudFront can be added in front of the same bucket later purely as an infra change.
- **Scheduled publishing**: EventBridge Scheduler rule → existing jobs endpoint, reusing `CRON_SECRET`.
- **Secrets**: AWS Secrets Manager for `PAYLOAD_SECRET`, `CRON_SECRET`, `PREVIEW_SECRET`, DB credentials.

## IaC choice

**SST (Ion)** recommended — has a ready-made Next.js/OpenNext construct that correctly wires Lambda + CloudFront + image optimization + revalidation, which is fiddly to hand-roll. Terraform/CDK are viable alternatives if org-wide IaC standardization matters more than setup speed, but budget more time for wiring OpenNext's multiple Lambda functions and CloudFront behaviors manually.

## Risks / effort notes

- ~~Postgres migration needs validation of all collections plus `schedulePublish` behavior end-to-end.~~ Done in Phase 1.
- ~~Media migration requires a one-off script to push `public/media` to S3 and repoint URLs.~~ Done in Phase 2 (`aws s3 sync`, flat key structure matched the existing local layout exactly, no repointing needed).
- Lambda cold starts on the admin panel are the main UX risk — acceptable since it's editor-only traffic, not customer-facing.
- Sharp's native binary needs the arm64 build target for Lambda (already a dependency, just needs correct build config).

## Phased plan

1. **DB** ✅ done: Swapped DB adapter to Postgres; runs against local/dockerized Postgres (`docker-compose.yml`); schema managed via explicit migrations in `src/migrations/`; seed and `schedulePublish` validated on Pages/Posts/MenuItems.
2. **Media** ✅ done: Added `@payloadcms/storage-s3` (private bucket, served via Payload's own file-proxy route); migrated all 256 existing `public/media` files; new uploads and seed data now go straight to S3. Credentials come from the AWS SDK default provider chain (`AWS_PROFILE` locally, IAM role in prod later) — no static access keys.
3. **Infra**: Stand up OpenNext + SST (or chosen IaC) targeting a staging AWS environment.
4. **Cron**: Point EventBridge Scheduler at the jobs endpoint; retire the old cron trigger.
5. **Cutover**: Switch DNS, monitor, decommission the old VM/Docker host.
