// Browser tests (e2e/*.spec.mjs): headless Chromium and Firefox against the page served from
// this folder. (Firefox is stricter in places Chromium lets slide, like an import map that
// comes after a module script.)
// Run: npm run test:e2e   (unit tests: npm run test:unit; both: npm test;
//      one browser: npx playwright test --project=firefox)
// The page loads three.js and the shared cohesion library from the network (cached: see
// e2e/helpers.mjs).
import { defineConfig, devices } from "@playwright/test";

const PORT = 8973;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1200, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"], viewport: { width: 1200, height: 800 },
        // WebGL in headless Chromium: on a Mac the GPU, through Metal (five times as fast as in
        // software: the drawing is most of what the tests wait for); elsewhere in software
        // (CHROME_GL: other flags, to try)
        launchOptions: { args: process.env.CHROME_GL !== undefined ? process.env.CHROME_GL.split(" ").filter(Boolean)
          : process.platform === "darwin" ? ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1200, height: 800 } } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    // never reuse: a stray server on this port (another project) would get tested instead
    reuseExistingServer: false,
    stderr: "ignore", // the server's request log
  },
});
