import { defineConfig, devices } from '@playwright/test';

// Ports and data dirs can be moved (parallel worktrees): KELVIN_E2E_PORT, KELVIN_E2E_BRANDS_PORT, KELVIN_E2E_DATA.
const PORT = Number(process.env.KELVIN_E2E_PORT ?? 4174);
const BRANDS_PORT = Number(process.env.KELVIN_E2E_BRANDS_PORT ?? 4175);
const DATA = process.env.KELVIN_E2E_DATA ?? '/tmp/kelvin-e2e';
// KELVIN_E2E_URL points the suite at a Kelvin already running in simulator mode on a fresh
// KELVIN_DATA (CI's image job: the built container). Unset, the suite starts its own backend.
const external = process.env.KELVIN_E2E_URL;
// The brands project (Plan 12) needs its own fresh backend: started here, or given by KELVIN_E2E_BRANDS_URL.
const brandsUrl = external ? process.env.KELVIN_E2E_BRANDS_URL : `http://127.0.0.1:${BRANDS_PORT}`;

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
    channel: 'chromium',
    // Kelvin follows the browser language (Plan 7): the default suite runs French; english.spec.ts sets English.
    locale: 'fr-FR'
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'phone',
      testIgnore: /brands\.spec\.ts/,
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup']
    },
    {
      name: 'desktop',
      testIgnore: /brands\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup']
    },
    ...(brandsUrl
      ? [
          {
            // Plan 12: a second simulator on a fresh KELVIN_DATA, claimed with « Atlantic Cozytouch ».
            name: 'brands',
            testMatch: /brands\.spec\.ts/,
            use: { baseURL: brandsUrl, viewport: { width: 390, height: 844 }, locale: 'fr-FR' }
          }
        ]
      : [])
  ],
  webServer: external
    ? undefined
    : [
        {
          command:
            `npm run build && rm -rf ${DATA} && cd ../backend && ` +
            `KELVIN_FAKE=1 KELVIN_DATA=${DATA} KELVIN_WEB=../web/build KELVIN_PORT=${PORT} ` +
            `uv run python -m kelvin`,
          url: `http://127.0.0.1:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 180_000
        },
        {
          // Starts once the first server answers, so the SPA build is complete.
          command:
            `until curl -sf http://127.0.0.1:${PORT}/api/health >/dev/null; do sleep 1; done && ` +
            `rm -rf ${DATA}-brands && cd ../backend && ` +
            `KELVIN_FAKE=1 KELVIN_DATA=${DATA}-brands KELVIN_WEB=../web/build KELVIN_PORT=${BRANDS_PORT} ` +
            `uv run python -m kelvin`,
          url: `http://127.0.0.1:${BRANDS_PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 240_000
        }
      ]
});
