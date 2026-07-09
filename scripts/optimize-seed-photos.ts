import 'dotenv/config'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Client } from 'pg'
import sharp from 'sharp'

// One-off: the seed dataset's dish-photo originals are lossless PNGs of photographic
// content (7-8.5MB each) — past Lambda's 6MB synchronous response limit, which is what
// OpenNext's image-optimizer hits when it fetches the original to resize. Re-encoding as
// JPEG (correct format for photos) at a capped resolution gets these to a reasonable web
// size without a visible quality loss, and fixes the underlying problem rather than just
// working around it.
const MAX_DIMENSION = 1920
const JPEG_QUALITY = 82

const s3 = new S3Client({ region: process.env.S3_REGION })
const bucket = process.env.S3_BUCKET

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows } = await client.query<{
    id: number
    filename: string
    width: number
    height: number
    filesize: number
  }>(`SELECT id, filename, width, height, filesize FROM media WHERE filename NOT ILIKE '%.svg' ORDER BY id`)

  console.log(`Processing ${rows.length} photo(s)...`)

  for (const row of rows) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: row.filename }))
    const original = await streamToBuffer(object.Body as NodeJS.ReadableStream)

    const resized = sharp(original).resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    const jpegBuffer = await resized.jpeg({ quality: JPEG_QUALITY }).toBuffer()
    const metadata = await sharp(jpegBuffer).metadata()

    const newFilename = row.filename.replace(/\.png$/i, '.jpg')

    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: newFilename, Body: jpegBuffer, ContentType: 'image/jpeg' }),
    )
    if (newFilename !== row.filename) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.filename }))
    }

    await client.query(
      `UPDATE media SET filename = $1, url = $2, mime_type = 'image/jpeg', filesize = $3, width = $4, height = $5 WHERE id = $6`,
      [newFilename, `/api/media/file/${newFilename}`, jpegBuffer.length, metadata.width, metadata.height, row.id],
    )

    console.log(
      `  ${row.filename} -> ${newFilename}: ${(row.filesize / 1024 / 1024).toFixed(2)}MB -> ${(jpegBuffer.length / 1024 / 1024).toFixed(2)}MB (${row.width}x${row.height} -> ${metadata.width}x${metadata.height})`,
    )
  }

  await client.end()
  console.log('Done.')
}

await main()
process.exit(0)
