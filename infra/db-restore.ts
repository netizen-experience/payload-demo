import { Client } from 'pg'

// S3 key (within the staging media bucket) where the local DB export is staged for the
// migrate-handler Lambda to pick up — shared between scripts/export-local-db-for-staging.ts
// (writer) and infra/migrate-handler.ts (reader).
export const EXPORT_KEY = '_db-migration/staging-restore-export.json'

// Payload-internal bookkeeping tables: excluded from restore on purpose.
// - payload_migrations: keep the target DB's own migration history intact.
// - payload_preferences(_rels), payload_locked_documents(_rels): ephemeral UI/editing state.
// - users_sessions: dead sessions tied to users this restore may replace.
// - payload_kv, payload_folders(_folder_type): not meaningful to carry over.
export const EXCLUDED_TABLES = new Set([
  'payload_migrations',
  'payload_preferences',
  'payload_preferences_rels',
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_jobs',
  'payload_jobs_log',
  'payload_kv',
  'payload_folders',
  'payload_folders_folder_type',
  'users_sessions',
])

// Only top-level collection/global tables need naming in the TRUNCATE — CASCADE
// follows the target DB's own FK graph to clear every _locales/_rels/_v/blocks_* child too.
export const TOP_LEVEL_TABLES = [
  'users',
  'media',
  'categories',
  'forms',
  'pages',
  'posts',
  'menu_items',
  'header',
  'footer',
  'redirects',
  'form_submissions',
  'search',
]

async function fkDependencies(client: Client, tables: string[]): Promise<Map<string, Set<string>>> {
  const { rows } = await client.query<{ child: string; parent: string }>(
    `
    SELECT DISTINCT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = ANY($1)
      AND ccu.table_name = ANY($1)
      AND tc.table_name != ccu.table_name
    `,
    [tables],
  )
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]))
  for (const { child, parent } of rows) {
    deps.get(child)?.add(parent)
  }
  return deps
}

function topoSort(tables: string[], deps: Map<string, Set<string>>): string[] {
  const remaining = new Set(tables)
  const ordered: string[] = []
  while (remaining.size > 0) {
    const ready = [...remaining].filter((t) => [...(deps.get(t) ?? [])].every((d) => !remaining.has(d)))
    if (ready.length === 0) {
      throw new Error(`Circular FK dependency among remaining tables: ${[...remaining].join(', ')}`)
    }
    ready.sort()
    for (const t of ready) {
      ordered.push(t)
      remaining.delete(t)
    }
  }
  return ordered
}

// Schema can drift between source and target (e.g. an enum option removed) — for enum
// columns, any stale value not in the target's current valid set gets coerced to null
// rather than aborting the whole restore.
async function enumValuesByColumn(client: Client, tables: string[]): Promise<Map<string, Set<string>>> {
  const { rows } = await client.query<{ table_name: string; column_name: string; enumlabel: string }>(
    `
    SELECT c.table_name, c.column_name, e.enumlabel
    FROM information_schema.columns c
    JOIN pg_type t ON t.typname = c.udt_name
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE c.table_schema = 'public' AND c.table_name = ANY($1)
    `,
    [tables],
  )
  const map = new Map<string, Set<string>>()
  for (const { table_name, column_name, enumlabel } of rows) {
    const key = `${table_name}.${column_name}`
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)?.add(enumlabel)
  }
  return map
}

async function insertTable(
  client: Client,
  table: string,
  rows: Record<string, unknown>[],
  enumValues: Map<string, Set<string>>,
  warnings: string[],
) {
  if (rows.length === 0) return
  const columns = Object.keys(rows[0])
  const columnList = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
  const insertSql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`
  for (const row of rows) {
    const values = columns.map((c) => {
      const value = row[c]
      const validValues = enumValues.get(`${table}.${c}`)
      if (validValues && value != null && !validValues.has(String(value))) {
        warnings.push(`${table}.${c}: stale value ${JSON.stringify(value)} (id=${row.id}) -> null`)
        return null
      }
      return value
    })
    await client.query(insertSql, values)
  }
}

async function resetSequence(client: Client, table: string) {
  const { rows } = await client.query<{ seq: string | null }>(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [
    table,
  ])
  const seq = rows[0]?.seq
  if (!seq) return
  await client.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table}"), 1))`, [seq])
}

export interface RestoreResult {
  warnings: string[]
  counts: Record<string, { source: number; target: number }>
}

// Truncates TOP_LEVEL_TABLES (and everything cascading from them) and reloads from
// dataByTable, in FK-safe order computed from the target DB's own schema.
export async function restoreDatabase(client: Client, dataByTable: Record<string, unknown[]>): Promise<RestoreResult> {
  const includeTables = Object.keys(dataByTable).filter((t) => !EXCLUDED_TABLES.has(t))
  const deps = await fkDependencies(client, includeTables)
  const insertOrder = topoSort(includeTables, deps)
  const enumValues = await enumValuesByColumn(client, includeTables)
  const warnings: string[] = []

  await client.query('BEGIN')
  try {
    await client.query(`TRUNCATE TABLE ${TOP_LEVEL_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
    for (const table of insertOrder) {
      await insertTable(client, table, (dataByTable[table] ?? []) as Record<string, unknown>[], enumValues, warnings)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }

  for (const table of includeTables) {
    await resetSequence(client, table)
  }

  const counts: RestoreResult['counts'] = {}
  for (const table of includeTables) {
    const sourceCount = (dataByTable[table] ?? []).length
    const { rows } = await client.query<{ count: string }>(`SELECT count(*) FROM "${table}"`)
    counts[table] = { source: sourceCount, target: Number(rows[0].count) }
  }

  return { warnings, counts }
}
