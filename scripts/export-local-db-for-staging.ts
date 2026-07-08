import 'dotenv/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Client } from 'pg'

import { EXCLUDED_TABLES, EXPORT_KEY } from '../infra/db-restore'

const EXPORT_BUCKET = process.env.STAGING_MEDIA_BUCKET

if (!EXPORT_BUCKET) {
  throw new Error('STAGING_MEDIA_BUCKET is required, e.g. STAGING_MEDIA_BUCKET=payload-demo-staging-... npm run ...')
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  )
  const tables = tableRows.map((r) => r.table_name).filter((t) => !EXCLUDED_TABLES.has(t))

  console.log(`Exporting ${tables.length} tables from local Postgres...`)
  const dataByTable: Record<string, unknown[]> = {}
  for (const table of tables) {
    const { rows } = await client.query(`SELECT * FROM "${table}"`)
    dataByTable[table] = rows
    console.log(`  ${table}: ${rows.length} row(s)`)
  }
  await client.end()

  const body = JSON.stringify(dataByTable)
  console.log(`\nUploading export (${(body.length / 1024).toFixed(1)} KB) to s3://${EXPORT_BUCKET}/${EXPORT_KEY}...`)

  const s3 = new S3Client({ region: process.env.S3_REGION })
  await s3.send(
    new PutObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: EXPORT_KEY,
      Body: body,
      ContentType: 'application/json',
    }),
  )

  console.log('Done.')
}

await main()
process.exit(0)
