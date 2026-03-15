import { expect, test } from '@playwright/test'

test('renders Ditado dashboard shell', async ({ page }) => {
  await page.goto('/?window=dashboard&tab=overview')
  await expect(page.getByText('Resident. Quiet. Ready.')).toBeVisible()
  await expect(page.getByText('Desktop workspace')).toBeVisible()
})
