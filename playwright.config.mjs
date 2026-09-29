// Browser tests (e2e/*.spec.mjs): headless Chromium against the page served from this folder.
// Run: npm run test:e2e   (unit tests: npm run test:unit; both: npm test)
// The page loads three.js and the shared cohesion library from the network.
import { defineConfig } from "@playwright/test";

const PORT = 8973;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1200, height: 800 },
    // WebGL in headless Chromium: software rendering
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    // never reuse: a stray server on this port (another project) would get tested instead
    reuseExistingServer: false,
    stderr: "ignore", // the server's request log
  },
});
