import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
// KELVIN_E2E_URL points the suite at a Kelvin already running in simulator mode on a fresh
// KELVIN_DATA (CI's image job: the built container). Unset, the suite starts its own backend.
const external = process.env.KELVIN_E2E_URL;

// The suite runs against the production topology: the backend (simulator, KELVIN_FAKE=1) serves
// both /api and the built SPA from web/build. `vite preview` is not used: it serves SvelteKit's
// own preview output, where /index.html (the SPA fallback the service worker precaches) is a 404,
// so the service worker never installs there.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: external ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // Only the full chromium build is installed here (no headless shell).
    channel: 'chromium'
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup']
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup']
    }
  ],
  webServer: external
    ? undefined
    : {
        command:
          `npm run build && rm -rf /tmp/kelvin-e2e && cd ../backend && ` +
          `KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-e2e KELVIN_WEB=../web/build KELVIN_PORT=${PORT} ` +
          `uv run python -m kelvin`,
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000
      }
});
