import 'dotenv/config'
import { Client } from 'pg'

import { EXCLUDED_TABLES, restoreDatabase } from '../infra/db-restore'

const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL
const TARGET_DATABASE_URL = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL

if (!SOURCE_DATABASE_URL) {
  throw new Error(
    'SOURCE_DATABASE_URL is required, e.g. SOURCE_DATABASE_URL=postgresql://payload:payload@127.0.0.1:5432/payload_demo npx tsx scripts/export-and-restore-to-neon.ts',
  )
}
if (!TARGET_DATABASE_URL) {
  throw new Error('TARGET_DATABASE_URL (or DATABASE_URL) is required and must point at the Neon database')
}

async function main() {
  const source = new Client({ connectionString: SOURCE_DATABASE_URL })
  await source.connect()

  const { rows: tableRows } = await source.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  )
  const tables = tableRows.map((r) => r.table_name).filter((t) => !EXCLUDED_TABLES.has(t))

  console.log(`Exporting ${tables.length} tables from source Postgres...`)
  const dataByTable: Record<string, unknown[]> = {}
  for (const table of tables) {
    const { rows } = await source.query(`SELECT * FROM "${table}"`)
    dataByTable[table] = rows
    console.log(`  ${table}: ${rows.length} row(s)`)
  }
  await source.end()

  console.log('\nRestoring into Neon...')
  const target = new Client({ connectionString: TARGET_DATABASE_URL })
  await target.connect()
  const { warnings, counts } = await restoreDatabase(target, dataByTable)
  await target.end()

  console.log('\nRow counts (source -> target):')
  for (const [table, { source: s, target: t }] of Object.entries(counts)) {
    const flag = s !== t ? '  <-- MISMATCH' : ''
    console.log(`  ${table}: ${s} -> ${t}${flag}`)
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`  ${w}`)
  }

  console.log('\nDone.')
}

await main()
process.exit(0)
