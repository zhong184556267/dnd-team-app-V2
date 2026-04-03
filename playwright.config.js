// @ts-check
import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '5173'
const baseURL = `http://127.0.0.1:${port}`
const skipServer = process.env.PLAYWRIGHT_SKIP_SERVER === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
    ...devices['Desktop Chrome'],
  },
  ...(skipServer
    ? {}
    : {
        webServer: {
          command: `npx vite --host 127.0.0.1 --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
