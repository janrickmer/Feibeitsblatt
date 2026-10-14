// playwright.config.mjs – Browser-Tests (npm run test:e2e): echte Oberfläche gegen echten `wrangler dev --local`
// (lokale D1, frischer Zustand je Lauf) und die Mock-KI aus test/mock-ai.mjs. LanguageTool simulieren die Tests selbst
// per page.route. Nur Chromium (in der Sandbox unter /opt/pw-browsers – dort nie `playwright install`).
import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { BASE_URL, E2E_PORT, MOCK_PORT, MOCK_URL } from "./test/e2e/env.mjs";

// Sandbox/CI mit vorinstallierten Browsern; sonst gilt der übliche Playwright-Speicherort
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,                    // gemeinsamer Zustand (eine Datenbank, eine Lehrkraft)
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: "node test/mock-ai.mjs --port " + MOCK_PORT,
      url: MOCK_URL + "/__mock/state",
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // löscht .wrangler/e2e, baut dist/ und startet wrangler dev (siehe test/e2e/serve.mjs)
      command: "node test/e2e/serve.mjs",
      url: BASE_URL + "/api/health",
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      env: { E2E_PORT: String(E2E_PORT) },
    },
  ],
});
