import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: process.env.FAVOURLOOP_RUN_ID
    ? `.logs/browser/${process.env.FAVOURLOOP_RUN_ID}/results`
    : "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: process.env.FAVOURLOOP_RUN_ID
          ? `.logs/browser/${process.env.FAVOURLOOP_RUN_ID}/report`
          : "playwright-report",
      },
    ],
  ],
  use: {
    baseURL: process.env.TEST_URL || "http://127.0.0.1:3000",
    trace: "on",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
  ],
});
