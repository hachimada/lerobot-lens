import { expect, test } from '@playwright/test'

test('opens the bundled demo, probes a frame, and scans the episode', async ({ page }) => {
  // The scenario runs the demo policy on CPU and, on CI runners, renders WebGL without a GPU.
  test.setTimeout(90_000)
  await page.goto('/')
  const sessionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /Try the demo/ }).click()
  const sessionResponse = await sessionResponsePromise
  expect(sessionResponse.status()).toBe(202)
  const session = (await sessionResponse.json()) as { id: string }

  await expect(page.getByRole('heading', { level: 1, name: /Episode #000/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'front camera' })).toBeVisible()
  await expect(page.getByRole('img', { name: /shoulder_pan: recorded actions/ })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('Joint mapping error')).toHaveCount(0)

  const urdfResponse = await page.request.get(`/api/sessions/${session.id}/urdf`)
  expect(urdfResponse.ok()).toBe(true)
  expect(await urdfResponse.text()).toContain('<robot')
  const assetResponse = await page.request.get(
    `/api/sessions/${session.id}/assets/base_so101_v2.stl`,
  )
  expect(assetResponse.ok()).toBe(true)

  // Probe from the keyboard, the way a user steps through an episode.
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByText('Frame 10 / 192')).toBeVisible()
  await page.keyboard.press('i')
  const probe = page.getByRole('region', { name: 'Selected probe' })
  await expect(probe).toContainText('Frames 10–57')
  // The new chunk replays against the recorded actions while the camera holds the input frame.
  await expect(page.getByRole('group', { name: 'Chunk player' })).toBeVisible()
  await expect(page.getByText(/Policy input · frame 10/)).toBeVisible()
  await expect(page.getByText(/Predicted action · step \d+\/48/)).toBeVisible()
  await expect(page.getByText('Frame 10 / 192')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Observed state')).toBeVisible()

  // The demo policy predicts 48-step chunks; a back-to-back scan of 193 frames takes 5 of them.
  await expect(page.getByText('· 5 chunks, every 48 frames')).toBeVisible()
  await page.getByRole('combobox', { name: 'Chunk overlap' }).selectOption('10')
  await expect(page.getByText('· 6 chunks, every 38 frames')).toBeVisible()
  await page.getByRole('button', { name: /Probe whole episode/ }).click()
  const probes = page.getByRole('region', { name: /Probes in this episode/ })
  // Six inferences on CPU can outlast the default 5-second assertion timeout on CI runners.
  await expect(probes.getByRole('listitem')).toHaveCount(7, { timeout: 30_000 })

  // Clicking a chunk on the probe track inspects it; the recording keeps its position.
  const track = page.getByRole('group', { name: 'Probe chunks' })
  await track.getByRole('button', { name: /^Probe 38–85/ }).click()
  await expect(page.getByText('Policy input · frame 38')).toBeVisible()
  await expect(page.getByText('Predicted action · step 1/48')).toBeVisible()
  await expect(page.getByText('Frame 10 / 192')).toBeVisible()
  await page
    .getByRole('group', { name: 'Stage shows' })
    .getByRole('button', { name: /^Recording/ })
    .click()
  await expect(page.getByText('Observed state')).toBeVisible()

  // Playing all chunks shows each frame from the latest observation: chunk 0–47 hands over
  // at frame 10 to the chunk probed there, without finishing.
  const playAll = page.getByRole('button', { name: /Play all chunks/ })
  await playAll.click()
  await expect(page.getByText('Policy input · frame 0')).toBeVisible()
  await playAll.click()
  await page.getByRole('slider', { name: 'Chunk step' }).fill('9')
  await playAll.click()
  await expect(page.getByText('Policy input · frame 10')).toBeVisible()
  await playAll.click()
  await expect(playAll).toHaveAttribute('aria-pressed', 'false')
})
