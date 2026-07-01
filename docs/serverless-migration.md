# Serverless Migration Notes (AWS + IaC)

**Status**: Recommendation made, not yet started.
**Recommendation**: Migrate. Low/spiky traffic + cost-driven motivation is a good fit for serverless, and this app is already close to serverless-ready.

## Why migrate

- Currently self-managed Docker/VM hosting, paying for always-on compute against low/spiky traffic.
- App is fundamentally stateless: no websockets, no in-memory caches, no custom server, no long-running background workers.
- Already builds with `output: standalone` ([next.config.ts](../next.config.ts)) — the ideal starting point for Lambda-based deployment.

## Current architecture snapshot

(Will change during migration — recorded here for reference.)

- **Database**: SQLite via `@payloadcms/db-sqlite`, file-based (`DATABASE_URL=file:./payload-demo.db`) — [src/payload.config.ts](../src/payload.config.ts)
- **Media storage**: local filesystem via `staticDir`, mounted as a Docker volume — [src/collections/Media.ts](../src/collections/Media.ts)
- **Scheduled publishing**: Payload jobs queue, gated by a `CRON_SECRET` bearer token, triggered externally — [src/payload.config.ts](../src/payload.config.ts)
- **Hosting**: Docker / docker-compose, Next.js `standalone` output, port 3000

## The three blockers

| Current | Problem on serverless | Fix |
|---|---|---|
| SQLite file | No persistent local disk between invocations | Swap to `@payloadcms/db-postgres` against RDS |
| Local filesystem media | Filesystem is ephemeral per-invocation | Add `@payloadcms/storage-s3` → S3 + CloudFront |
| External process hits jobs endpoint with `CRON_SECRET` | No always-on process to poll | EventBridge Scheduler → same jobs endpoint, same token |

Everything else (routing, RSC, admin panel, REST/GraphQL APIs) runs inside the Next.js request lifecycle and deploys to Lambda unmodified via **OpenNext**.

## Target architecture

- **Compute**: Lambda via OpenNext + CloudFront. Not Fargate — Fargate bills for a running task even at zero traffic, which defeats the cost goal for spiky/low traffic.
- **Database**: RDS Postgres `db.t4g.micro` to start (~$12-15/mo). Cheaper cost floor than Aurora Serverless v2 (min 0.5 ACU ≈ $45+/mo) at this traffic level. Revisit Aurora Serverless v2 only if traffic grows enough to need auto-scaling.
- **Media**: S3 + `@payloadcms/storage-s3` adapter + CloudFront for delivery.
- **Scheduled publishing**: EventBridge Scheduler rule → existing jobs endpoint, reusing `CRON_SECRET`.
- **Secrets**: AWS Secrets Manager for `PAYLOAD_SECRET`, `CRON_SECRET`, `PREVIEW_SECRET`, DB credentials.

## IaC choice

**SST (Ion)** recommended — has a ready-made Next.js/OpenNext construct that correctly wires Lambda + CloudFront + image optimization + revalidation, which is fiddly to hand-roll. Terraform/CDK are viable alternatives if org-wide IaC standardization matters more than setup speed, but budget more time for wiring OpenNext's multiple Lambda functions and CloudFront behaviors manually.

## Risks / effort notes

- Postgres migration needs validation of all collections plus `schedulePublish` behavior end-to-end.
- Media migration requires a one-off script to push `public/media` to S3 and repoint URLs.
- Lambda cold starts on the admin panel are the main UX risk — acceptable since it's editor-only traffic, not customer-facing.
- Sharp's native binary needs the arm64 build target for Lambda (already a dependency, just needs correct build config).

## Phased plan

1. **DB**: Swap DB adapter to Postgres; run against local/dockerized Postgres; validate collections + `schedulePublish`.
2. **Media**: Add `@payloadcms/storage-s3`; migrate existing `public/media` files to S3; repoint URLs.
3. **Infra**: Stand up OpenNext + SST (or chosen IaC) targeting a staging AWS environment.
4. **Cron**: Point EventBridge Scheduler at the jobs endpoint; retire the old cron trigger.
5. **Cutover**: Switch DNS, monitor, decommission the old VM/Docker host.
