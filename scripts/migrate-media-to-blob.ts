import 'dotenv/config'
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { put } from '@vercel/blob'
import { Client } from 'pg'

const S3_BUCKET = process.env.S3_BUCKET
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN

if (!S3_BUCKET) throw new Error('S3_BUCKET is required')
if (!BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required')

async function listAllKeys(s3: S3Client): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, ContinuationToken: continuationToken }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)
  return keys
}

async function main() {
  const s3 = new S3Client({ region: process.env.S3_REGION })
  const keys = await listAllKeys(s3)
  console.log(`Found ${keys.length} objects in s3://${S3_BUCKET}`)

  const urlByFilename = new Map<string, string>()
  let i = 0
  for (const key of keys) {
    i++
    const [obj, head] = await Promise.all([
      s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })),
      s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })),
    ])
    const body = Buffer.from(await obj.Body!.transformToByteArray())
    const { url } = await put(key, body, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: head.ContentType,
    })
    urlByFilename.set(key, url)
    console.log(`  [${i}/${keys.length}] ${key} -> ${url}`)
  }

  console.log('\nUpdating media table URLs in Neon...')
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows: sizeColumns } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'media' AND column_name LIKE 'sizes_%_filename'`,
  )
  const sizeKeys = sizeColumns.map((r) => r.column_name.replace(/^sizes_/, '').replace(/_filename$/, ''))

  const { rows: mediaRows } = await db.query<Record<string, unknown>>(`SELECT * FROM "media"`)

  let updated = 0
  let missing = 0
  for (const row of mediaRows) {
    const sets: string[] = []
    const values: unknown[] = []

    const filename = row.filename as string | null
    if (filename) {
      const url = urlByFilename.get(filename)
      if (url) {
        values.push(url)
        sets.push(`"url" = $${values.length}`)
      } else {
        console.warn(`  WARNING: no Blob URL found for base filename "${filename}" (media id=${row.id})`)
        missing++
      }
    }

    for (const size of sizeKeys) {
      const sizeFilename = row[`sizes_${size}_filename`] as string | null
      if (!sizeFilename) continue
      const url = urlByFilename.get(sizeFilename)
      if (url) {
        values.push(url)
        sets.push(`"sizes_${size}_url" = $${values.length}`)
      } else {
        console.warn(`  WARNING: no Blob URL found for size filename "${sizeFilename}" (media id=${row.id})`)
        missing++
      }
    }

    if (sets.length === 0) continue
    values.push(row.id)
    await db.query(`UPDATE "media" SET ${sets.join(', ')} WHERE id = $${values.length}`, values)
    updated++
  }

  await db.end()
  console.log(`\nUpdated ${updated} media row(s), ${missing} filename(s) had no matching Blob URL.`)
  console.log('Done.')
}

await main()
process.exit(0)
