import { expect, test } from '@playwright/test'

test('opens the bundled demo and runs an action-chunk inference', async ({ page }) => {
  await page.goto('/')
  const sessionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Explore with demo data' }).click()
  const sessionResponse = await sessionResponsePromise
  expect(sessionResponse.status()).toBe(202)
  const session = (await sessionResponse.json()) as { id: string }

  await expect(page.getByText('hachimada/so101_pick_place_red_1 · Episode 0')).toBeVisible()
  await expect(page.locator('.primary-camera img')).toBeVisible()
  await expect(
    page.getByRole('img', { name: /Selected joint actions: dataset over the full episode/ }),
  ).toBeVisible()
  await expect(page.locator('.viewer canvas')).toBeVisible()
  await expect(page.locator('.viewer-error')).toHaveCount(0)

  const urdfResponse = await page.request.get(`/api/sessions/${session.id}/urdf`)
  expect(urdfResponse.ok()).toBe(true)
  expect(await urdfResponse.text()).toContain('<robot')
  const assetResponse = await page.request.get(
    `/api/sessions/${session.id}/assets/base_so101_v2.stl`,
  )
  expect(assetResponse.ok()).toBe(true)

  await page.getByRole('button', { name: /Infer action chunk/ }).click()
  await expect(page.getByText('48 actions')).toBeVisible()
  await expect(page.getByText('POLICY OUTPUT', { exact: true })).toBeVisible()
})
