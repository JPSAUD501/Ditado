import { expect, test } from '@playwright/test'

test('renders Ditado dashboard shell', async ({ page }) => {
  await page.goto('/?window=dashboard&tab=overview')
  await expect(page.getByText('Voice as a writing layer.')).toBeVisible()
})
