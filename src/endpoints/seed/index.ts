import type { Payload, PayloadRequest } from 'payload'
import { seedRestaurant } from './restaurant'

// Next.js revalidation errors are normal when seeding the database without a server running
export const seed = async ({
  payload,
  req,
}: {
  payload: Payload
  req: PayloadRequest
}): Promise<void> => {
  await seedRestaurant({ payload, req })
}
