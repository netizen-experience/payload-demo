import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

/**
 * Smoke tests against a deployed environment (e.g. the Phase 3 SST staging stack), not local dev.
 * Requires STAGING_URL. No webServer — this never starts a local server, only hits a real
 * deployed URL over the network.
 */
if (!process.env.STAGING_URL) {
  throw new Error('STAGING_URL is required, e.g. STAGING_URL=https://xxxx.cloudfront.net npm run test:e2e:staging')
}

export default defineConfig({
  testDir: './tests/e2e-staging',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.STAGING_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
})
