import { expect, test } from '@playwright/test'

test('renders Ditado dashboard shell', async ({ page }) => {
  await page.goto('/?window=dashboard&tab=overview')
  await expect(page.getByText('Meet Ditado')).toBeVisible()
  await expect(page.getByText('Voice dictation, reimagined')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
})
