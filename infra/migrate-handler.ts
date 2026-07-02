import { createLocalReq, getPayload } from 'payload'

import config from '../src/payload.config'
import { seed } from '../src/endpoints/seed/index'

interface MigrateEvent {
  seed?: boolean
}

export const handler = async (event: MigrateEvent = {}) => {
  const payload = await getPayload({ config })

  await payload.db.migrate()
  payload.logger.info('Migrations complete')

  if (event.seed) {
    await seed({ payload, req: await createLocalReq({}, payload) })
    payload.logger.info('Seed complete')
  }

  return { migrated: true, seeded: Boolean(event.seed) }
}
