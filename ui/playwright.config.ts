import { defineConfig } from "@playwright/test";

// Runs against the production build (npm run build first). CHROMIUM_PATH points at a system Chromium
// when Playwright's own browser download is not available.
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: { baseURL: "http://localhost:4173/", launchOptions, acceptDownloads: true },
  projects: [
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: "npm run preview", url: "http://localhost:4173/", reuseExistingServer: true, timeout: 60_000 },
});
