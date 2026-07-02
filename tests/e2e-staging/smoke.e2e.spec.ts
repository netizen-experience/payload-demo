import path from 'path'
import { fileURLToPath } from 'url'

import { test, expect, Page } from '@playwright/test'

import { login } from '../helpers/login'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverURL = process.env.STAGING_URL as string
const testImagePath = path.resolve(dirname, 'fixtures/test-image.png')

// These always run: no credentials needed, just confirm the deployment is reachable.
test.describe('Staging smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto(`${serverURL}/en`)
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('menu page loads', async ({ page }) => {
    await page.goto(`${serverURL}/en/menu`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('admin login page loads', async ({ page }) => {
    await page.goto(`${serverURL}/admin/login`)
    await expect(page.locator('#field-email')).toBeVisible()
    await expect(page.locator('#field-password')).toBeVisible()
  })
})

// These need a real admin account on the target deployment — bootstrapping one automatically
// would mean either exposing a way to create users without auth (a real security hole) or
// this test reaching the DB directly (impossible for a VPC-private database like staging's
// Aurora instance). Create one once via the migration Lambda (see docs/serverless-migration.md)
// and pass its credentials in; the authenticated tests are skipped without them.
const testUser = {
  email: process.env.STAGING_TEST_EMAIL,
  password: process.env.STAGING_TEST_PASSWORD,
}

test.describe('Staging authenticated flow', () => {
  test.skip(
    !testUser.email || !testUser.password,
    'Set STAGING_TEST_EMAIL and STAGING_TEST_PASSWORD to run these tests',
  )

  let page: Page
  let createdMediaId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    page = await context.newPage()

    await login({
      page,
      serverURL,
      user: { email: testUser.email as string, password: testUser.password as string },
    })
  })

  test.afterAll(async () => {
    if (createdMediaId) {
      const res = await page.request.delete(`${serverURL}/api/media/${createdMediaId}`)
      if (!res.ok()) {
        throw new Error(
          `Cleanup failed: DELETE /api/media/${createdMediaId} returned ${res.status()} ${await res.text()}`,
        )
      }
    }
  })

  test('can upload media and sharp generates size variants', async () => {
    await page.goto(`${serverURL}/admin/collections/media/create`)

    await page.setInputFiles('input[type="file"]', testImagePath)
    await page.fill('#field-alt', 'Staging smoke test upload')
    // Payload's save button is a plain <button type="button"> wired to form submit via
    // onClick, not a native type="submit" — id="action-save" is the stable selector.
    await page.click('#action-save')

    // Numeric ID only — the current /create URL would otherwise match a looser pattern
    // immediately, before the save actually completes and the URL changes.
    await page.waitForURL(/\/admin\/collections\/media\/\d+$/)

    const url = page.url()
    const match = url.match(/\/media\/(\d+)$/)
    createdMediaId = match ? match[1] : null
    expect(createdMediaId).not.toBeNull()

    // A generated thumbnail proves sharp actually ran inside the deployed Lambda —
    // the test image (1600x1200) is larger than every defined size threshold.
    const thumbnail = page.locator('img[src*="-300x225"], img[src*="thumbnail"]').first()
    await expect(thumbnail).toBeVisible({ timeout: 15000 })
  })
})
