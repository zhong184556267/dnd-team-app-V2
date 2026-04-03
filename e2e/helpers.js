/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function loginAs(page, name) {
  await page.goto('/')
  await page.locator('#login-name').fill(name)
  await page.getByRole('button', { name: '进入繁星世界' }).click()
  await page.waitForURL(/\/(characters)?$/)
}

/**
 * @param {import('@playwright/test').Page} page
 */
export async function clearAppStorage(page) {
  await page.goto('/')
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
}
