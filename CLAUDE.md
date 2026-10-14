# Kelvin — notes for coding agents

Kelvin is a self-hosted FastAPI + SvelteKit app that controls Sauter radiators through the
Overkiz (Cozytouch) cloud and shows Linky energy from MyElectricalData. `README.md` says what
it does, `CONTRIBUTING.md` how to work on it. This file is the short list of rules the code
depends on.

## Where truth lives

- `PRODUCT.md`: who it is for and the product principles.
- `DESIGN.md`: the design system as built (tokens, components, French copy). It is the design
  reference; UI work follows it.
- `docs/overkiz-notes.md`: Overkiz behaviour verified on real radiators. Read it before adding
  or changing any device command, and record every new verification there (no ids or serials).
- `docs/linky-notes.md`: MyElectricalData behaviour and quotas.
- `backend/README.md` (API, environment) and `web/README.md` (web development).

## The simulator, always

- `KELVIN_FAKE=1` runs the simulator (`backend/kelvin/overkiz/fake.py`, a synthetic Linky in
  `backend/kelvin/linky/fake.py`). Use it for development, demos and every automated test.
  Tests and e2e log in through the real flow with `demo@kelvin.local` / `kelvin`.
- Tests never contact Overkiz or MyElectricalData: use `FakeGateway`, `FakeLinkySource`,
  `httpx.MockTransport` or a stub client.
- `backend/scripts/` talk to a real installation. Run them only when the human asks and is
  watching, on their own installation. Read-only first; revert any write at once and confirm the
  original state. They write only under `backend/captures/` (gitignored).
- Never read `.env`, `account.json`, `backend/captures/` or a real `KELVIN_DATA`. Never put an
  email, password, token, PDL, gateway id, device serial, place id or real reading into code,
  tests, fixtures, docs, screenshots or commit messages.

## Rules the code depends on

- **Device state is the source of truth.** A command is done when the expected state arrives.
  Overkiz often reports `FAILED OVERRIDEMODE_ERROR` for commands that did apply.
- **Restore order:** a restore sets the previous target first, then the mode, in one action. In
  programme mode the target is the remembered manual setpoint.
- **Language:** user-facing strings (errors, labels, UI) are French and follow DESIGN.md
  (no-break space before units, `−`, `—` for a missing value, typographic `’`). Code, logs and
  docs are English.
- **API header:** mutating API routes require the header `X-Kelvin: 1`.
- **Login:** every `/api` route except `/api/auth/*` and `/api/health` needs a session (cookie
  `kelvin_session`), `/api/stream` included. Login is the home's Cozytouch account.
- **Secrets:** the Cozytouch password and the MED token live only in env vars or
  `$KELVIN_DATA/account.json` (0600): never in logs, API responses, the DB or git. The Linky
  token is write-only; the PDL is never logged.
- **Missing data is `null`, never 0**, in the API, and « — » in the UI.
- **Network:** `/api/health` is open and says only the status word. Forwarded headers are
  ignored unless `KELVIN_TRUSTED_PROXIES` names the reverse proxy; nothing shipped enables them
  (`backend/tests/test_packaging.py` checks).
- **Web stack:** SvelteKit stays on 2.x (`@vite-pwa/sveltekit` does not support kit 3);
  Playwright uses `channel: 'chromium'`.
- **UI rules** (details in DESIGN.md): motion uses the tokens in `app.css` and `$lib/motion`
  (`dur()` returns 0 under reduced motion — pass it to every Svelte transition); a pending
  control shows the shared dashed→solid edge; controls that can hold focus are paused with
  `aria-disabled` and a guarded handler, never native `disabled`; every route shows skeletons
  before data, never placeholder values; no horizontal scroll from 320 px and CLS < 0.05
  (e2e checks both). Buttons use the global `.btn-*` classes.

## Checks

- backend: `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
- web: `cd web && npx vitest run && npm run check && npx playwright test`
- image (Dockerfile, compose or launcher changes): `bash scripts/docker-smoke.sh`
