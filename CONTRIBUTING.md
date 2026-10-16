# Contributing to Kelvin

Thanks for helping. Kelvin controls real heating, so the bar is: honest device state,
no secrets anywhere, and every change tested against the simulator.

Kelvin is an independent project, not affiliated with the companies whose services it talks
to (see the note at the end of `README.md`).

## Set up

You need [uv](https://docs.astral.sh/uv/) (Python 3.13 is installed by uv), Node.js 24 with
npm, and Docker for the image checks.

    git clone https://github.com/lborruto/kelvin.git && cd kelvin
    cd backend && uv sync && cd ..
    cd web && npm ci && npx playwright install chromium && cd ..

## Run it with the simulator

    # terminal 1: the backend, simulating a home (no Cozytouch or Linky calls)
    cd backend && KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-dev uv run uvicorn --factory kelvin.api.app:create_app --reload --port 8000
    # terminal 2: the web app with hot reload, proxying /api to :8000
    cd web && npm run dev

Open http://127.0.0.1:5173 and log in with `demo@kelvin.local` / `kelvin`. The simulator has
three rooms, four radiators, a week of history, a synthetic Linky and a demo tariff.

## Checks

Run both before opening a pull request. CI runs the same: workflow lint, backend, web, the
Playwright suite in 4 shards, and the Docker image (build, smoke test, then the e2e suite against
the container in 3 shards); all must be green.

    cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
    cd web && npx vitest run && npm run check && npx playwright test
    bash scripts/docker-smoke.sh   # when you touch the Dockerfile, compose or the launcher

Every automated test uses the simulator (`KELVIN_FAKE=1`) or fakes, and logs in through the
real flow with `demo@kelvin.local` / `kelvin`. A test that needs the network, a real account
or real data will not be merged.

## Commits and pull requests

- Conventional Commit subjects, as in the history: `feat(web): …`, `fix(api): …`, `test: …`,
  `docs: …`, `ci: …`, `build: …`, `chore: …`. Say why in the body when it is not obvious.
- One topic per pull request, with tests. Fill in the template's checklist.

## UI copy (French and English)

The UI is French (default) and English; code, logs and docs are English. Every string is a
message in `web/src/lib/i18n/fr.ts` and `en.ts`, never a literal in a component:
- add the message to `fr.ts`; `npm run check` then fails until `en.ts` has it too;
- write the English from `docs/glossary.md` (add a new term there first);
- follow DESIGN.md "Copy (French and English)": a no-break space (U+00A0) before units in French
  (« 20,1 °C », « 100 % »), “42%” and “€16.20” in English, the true minus `−`, `—` for a missing
  value, typographic apostrophes (’), Paris time, 24 h;
- read messages in templates or `$derived`, never at module scope (a label array holds keys or
  getters), so a language switch reaches them;
- a backend error is a code in `backend/kelvin/errors.py` (a pending label in `labels.py`), then
  `cd backend && uv run python scripts/export_codes.py`, then its text in both dictionaries;
- `npx vitest run` checks it all: no hard-coded French left, no unused key, no message read at
  module scope, both languages with the same keys and parameters, typography, and no French URL
  path outside the redirect table.

## Never commit real data or credentials

- No email, password, token, PDL, customer id, gateway id, device serial, place id, local IP
  or real reading in code, tests, fixtures, docs, screenshots, logs you paste or commit
  messages. Fixtures are synthetic; screenshots come from the simulator.
- `.env`, `account.json`, `KELVIN_DATA` and `backend/captures/` are gitignored. Keep it so.
- Found something sensitive in the history? Report it privately (see `SECURITY.md`).

## Verifying device behaviour safely

The simulator mirrors behaviour verified on real radiators (`docs/overkiz-notes.md`). To
change a device command or learn a new one, work only on your own installation:

1. Read `docs/overkiz-notes.md` first; the answer may be there.
2. Read before you write: `backend/scripts/capture_fixture.py` dumps your home (read-only) to
   `backend/captures/home_dump.json`, which is gitignored. The scripts take your Cozytouch
   account from `COZY_USER` / `COZY_PASS` in the environment.
3. Write to one radiator, note its state before, and revert at once
   (`backend/scripts/overkiz_try.py`). Confirm the original state is back.
4. Record what you observed in `docs/overkiz-notes.md`: date, radiator model, command and
   payload, the states and execution events that came back. No ids, serials or labels from
   your home.
5. Teach the simulator (`backend/kelvin/overkiz/fake.py`) the same behaviour, with a test.

## Design

UI changes follow `DESIGN.md` (Précision: hairlines, radius ≤ 10 px, Onest with tabular
figures, no shadows), keep 44 px touch targets and WCAG AA in both themes, and honour
`prefers-reduced-motion`.
