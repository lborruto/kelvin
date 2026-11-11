# Contributing to Kelvin

Thanks for helping. Kelvin controls real heating, so the bar is: honest device state,
no secrets anywhere, and every change tested against the simulator.

Kelvin is an independent project, not affiliated with the companies whose services it talks
to (see the note at the end of `README.md`).

Contents: [Set up](#set-up) · [Run it with the simulator](#run-it-with-the-simulator) ·
[Checks](#checks) · [Commits and pull requests](#commits-and-pull-requests) ·
[UI copy](#ui-copy-french-and-english) · [How it works](#how-it-works) ·
[Project status](#project-status).
Component details live in [backend/README.md](backend/README.md) (configuration, API, MCP, Linky,
data) and [web/README.md](web/README.md) (web development, screens, CSV export).

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
three rooms, four radiators, 45 days of history (`KELVIN_SIM_HISTORY_DAYS`), a synthetic Linky and a demo tariff.

## Checks

Run both before opening a pull request. CI runs the same: workflow lint, backend, web, the
Playwright suite in 4 shards, and the Docker image (build, smoke test, then the e2e suite against
the container in 3 shards); all must be green.

    cd backend && uv run pytest -q -n auto && uv run ruff check . && uv run ruff format --check .
    cd web && npx vitest run && npm run check && npx playwright test
    bash scripts/docker-smoke.sh   # when you touch the Dockerfile, compose or the launcher

`-n auto` (pytest-xdist) runs the backend tests on every core; leave it out to run them in one
process, as `-x` or a debugger want.

Every automated test uses the simulator (`KELVIN_FAKE=1`) or fakes (Overkiz, MyElectricalData,
Open-Meteo), and logs in through the
real flow with `demo@kelvin.local` / `kelvin`. A test that needs the network, a real account
or real data will not be merged.

## Commits and pull requests

- Commit subjects are plain imperative sentences, as in the history, with no type prefix:
  « Pin the room-tile height check to a fixed time », « End an override only after its restored
  radiators are read back ». Say why in the body when it is not obvious.
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

UI changes follow `DESIGN.md` (« Tableau »: one dark theme, rounded surfaces stepping up from the ground,
Geist with tabular figures, screens built from the kit), keep 44 px touch targets and WCAG AA, and honour
`prefers-reduced-motion`.

## How it works

- **Backend** (`backend/`, Python, FastAPI): it talks to Overkiz through
  [pyoverkiz](https://github.com/iMicknl/python-overkiz-api). It keeps a model of the house
  from the device events, confirms each command by the state the radiator reports, and records
  samples and meter readings in SQLite. It follows Cozytouch events and re-reads one radiator's
  states every 10 minutes; it reads the whole Cozytouch setup only at startup, after an outage
  or a password change, for a nightly refresh and for changes made in the Cozytouch app or from
  Kelvin (at most 3 times a day, the last one always kept for a restart), because Overkiz limits
  those reads. It runs
  boost and away itself, syncs Linky within its quota, and serves a REST API with server-sent
  events. See [backend/README.md](backend/README.md).
- **Web** (`web/`, SvelteKit, Svelte 5): a static PWA served by the backend. Every string lives
  in a French and an English dictionary; the API answers errors with a stable code the web
  translates, next to a French `detail`. See [web/README.md](web/README.md).
- **Device facts** verified on Sauter radiators (and, marked UNVERIFIED, what Kelvin sends to other kinds): [docs/overkiz-notes.md](docs/overkiz-notes.md);
  MyElectricalData: [docs/linky-notes.md](docs/linky-notes.md).
- **Product and design:** [PRODUCT.md](PRODUCT.md) and the design system,
  [DESIGN.md](DESIGN.md).
- **What each feature does:** [README.md](README.md#what-it-does) in plain words; the behaviour a
  change must keep is in [CLAUDE.md](CLAUDE.md) (« Rules the code depends on »), each rule next to the
  test that guards it.

## Project status

Early (0.x). Kelvin is developed against one installation: Sauter IPALA H and HEKLA radiators
on io-homecontrol, with a Cozytouch bridge. Multi-brand: servers and device kinds beyond
Sauter are « expected to work » or « experimental » and untested on real hardware (see
[backend/README.md › Device compatibility](backend/README.md#device-compatibility)); messages that name Cozytouch keep that word on every server. The
UI is in French and English (French by default; switch in Settings › Display, or on the sign-in
screen). The Linky bill estimate supports the Base, HC/HP and Tempo options; Tempo and EcoWatt
are shown on Maison and Energy and raise alerts. AI assistants can read Kelvin's data through a
read-only MCP endpoint, with its tokens in Settings › Account.
