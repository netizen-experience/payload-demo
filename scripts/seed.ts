import 'dotenv/config'
import { getPayload, createLocalReq } from 'payload'
import config from '../src/payload.config.ts'
import { seed } from '../src/endpoints/seed/index.ts'

const payload = await getPayload({ config })
await seed({ payload, req: await createLocalReq({}, payload) })
await payload.db.destroy()
process.exit(0)
