import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4200/sprint-planning-poker/',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'bun install --cwd ../node-server --no-save && rm -f ../node-server/bun.lock && bun run --cwd ../node-server build && bun ../node-server/dist/index.js',
      port: 8080,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'bun run preview',
      port: 4200,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
