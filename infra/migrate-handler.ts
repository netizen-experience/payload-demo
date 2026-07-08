import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createLocalReq, getPayload } from 'payload'
import { Client } from 'pg'

import config from '../src/payload.config'
import { seed } from '../src/endpoints/seed/index'
import { EXPORT_KEY, restoreDatabase } from './db-restore'

interface MigrateEvent {
  seed?: boolean
  restore?: boolean
  preserveUserEmail?: string
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

export const handler = async (event: MigrateEvent = {}) => {
  const payload = await getPayload({ config })

  // Known issue: dynamically importing the auto-generated .ts migration files fails
  // inside this Lambda specifically (works fine calling payload.db.migrate() the exact
  // same way locally, on the same Node version) — looks like an esbuild/nodejs.install
  // bundling quirk with tsx's ESM transform, not a real schema problem. Non-fatal so it
  // doesn't block seed/restore, which don't depend on it — but a real bug to fix
  // separately: any *new* migration genuinely won't get applied to this DB until then.
  let migrated = false
  try {
    await payload.db.migrate()
    migrated = true
    payload.logger.info('Migrations complete')
  } catch (err) {
    payload.logger.error({ err }, 'Migrations failed — continuing, see known-issue note in migrate-handler.ts')
  }

  if (event.seed) {
    await seed({ payload, req: await createLocalReq({}, payload) })
    payload.logger.info('Seed complete')
  }

  let restoreSummary: Awaited<ReturnType<typeof restoreDatabase>> | undefined
  if (event.restore) {
    const s3 = new S3Client({ region: process.env.S3_REGION })
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: EXPORT_KEY }))
    const dataByTable = JSON.parse(await streamToString(object.Body as NodeJS.ReadableStream))

    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    // Preserve a specific existing user (e.g. an e2e test account) across the wipe —
    // the import data won't contain it, so re-insert it afterward with a fresh id.
    let preservedUser: Record<string, unknown> | null = null
    if (event.preserveUserEmail) {
      const { rows } = await client.query('SELECT * FROM users WHERE email = $1', [event.preserveUserEmail])
      preservedUser = rows[0] ?? null
      payload.logger.info(`Preserve user ${event.preserveUserEmail}: ${preservedUser ? 'found' : 'not found'}`)
    }

    restoreSummary = await restoreDatabase(client, dataByTable)
    payload.logger.info(`Restore complete: ${JSON.stringify(restoreSummary.counts)}`)
    if (restoreSummary.warnings.length) {
      payload.logger.info(`Restore warnings: ${JSON.stringify(restoreSummary.warnings)}`)
    }

    if (preservedUser) {
      const columns = Object.keys(preservedUser).filter((c) => c !== 'id')
      const columnList = columns.map((c) => `"${c}"`).join(', ')
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO "users" (${columnList}) VALUES (${placeholders})`,
        columns.map((c) => preservedUser![c]),
      )
      await client.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM "users"))`)
      payload.logger.info(`Re-inserted preserved user ${event.preserveUserEmail}`)
    }

    await client.end()
  }

  return { migrated, seeded: Boolean(event.seed), restore: restoreSummary }
}
