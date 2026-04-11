import 'dotenv/config'
import { getPayload, createLocalReq } from 'payload'
import config from '../src/payload.config'
import { seed } from '../src/endpoints/seed/index'

const payload = await getPayload({ config })
await seed({ payload, req: await createLocalReq({}, payload) })
await payload.db?.destroy?.()
process.exit(0)
