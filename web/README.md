# Kelvin web

SvelteKit (Svelte 5) PWA, built as a static SPA and served by the backend in production.

## Develop

    # terminal 1 — the backend in simulator mode
    cd backend && KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-dev uv run uvicorn --factory kelvin.api.app:create_app --port 8000
    # terminal 2 — the UI with hot reload, proxying /api to :8000 (override with KELVIN_API)
    cd web && npm ci && npm run dev

Kelvin asks for a login. In simulator mode (`KELVIN_FAKE=1`) the account is
`demo@kelvin.local` / `kelvin`; the first login on a fresh `KELVIN_DATA` makes it the home's account.

## Check

    npm run check        # svelte-check
    npx vitest run       # unit and component tests
    npx playwright test  # end-to-end against the simulator (builds, then starts the backend serving the build)

The end-to-end suite runs a phone (Pixel 7) and a desktop project in Chromium, on port 4174 with
its data in `/tmp/kelvin-e2e`, through `python -m kelvin` like the Docker image. If Playwright
asks for a browser: `npx playwright install chromium`. A `setup` project logs in through the
login screen first and shares the session (`e2e/.auth/state.json`, gitignored) with the others.

Screenshots (simulator only): `SCREENS=1 npx playwright test screens` writes them to
`test-results/screens/`; set `SCREENS_DIR` to write elsewhere.

## Serve the build from the backend

    npm run build
    cd ../backend && KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-dev KELVIN_WEB=../web/build uv run python -m kelvin

Then open http://127.0.0.1:8000. Against your own home, drop `KELVIN_FAKE=1` and use a real
data directory (`KELVIN_DATA=./data`).

The version shown on Maison comes from `package.json`. Icons are rendered from
`static/icon.svg` by `npm run icons`.
