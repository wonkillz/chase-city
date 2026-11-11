import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1100, height: 740 },
      },
    },
    {
      name: "iphone-webkit",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "webkit",
        launchOptions: {},
      },
    },
  ],
});
