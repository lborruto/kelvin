# Contributing to Kelvin

Thanks for helping. Kelvin controls real heating, so the bar is: honest device state,
no secrets anywhere, and every change tested against the simulator.

Kelvin is an independent project, not affiliated with the companies whose services it talks
to (see the note at the end of `README.md`).

Contents: [Set up](#set-up) · [Run it with the simulator](#run-it-with-the-simulator) ·
[Checks](#checks) · [Commits and pull requests](#commits-and-pull-requests) ·
[UI copy](#ui-copy-french-and-english) · [How it works](#how-it-works) ·
[Feature reference](#feature-reference) · [Project status](#project-status).
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
three rooms, four radiators, a week of history, a synthetic Linky and a demo tariff.

## Checks

Run both before opening a pull request. CI runs the same: workflow lint, backend, web, the
Playwright suite in 4 shards, and the Docker image (build, smoke test, then the e2e suite against
the container in 3 shards); all must be green.

    cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
    cd web && npx vitest run && npm run check && npx playwright test
    bash scripts/docker-smoke.sh   # when you touch the Dockerfile, compose or the launcher

Every automated test uses the simulator (`KELVIN_FAKE=1`) or fakes (Overkiz, MyElectricalData,
Open-Meteo), and logs in through the
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

## Feature reference

What each feature does, precisely: the behaviour a change must keep. The README says the same in
plain words.

- **Rooms first.** Overkiz places become rooms; a room with two radiators acts as one, and
  the detail shows each radiator.
- **Truthful commands.** A change counts as done only when the radiator reports the new state.
  Pending, confirmed and failed are shown as such, including Overkiz's misleading
  `OVERRIDEMODE_ERROR` on commands that did apply. Before calling a command failed, Kelvin reads
  the radiators once; a programme the radiators hold with other times says so, and a failure the
  radiator confirms later turns confirmed.
- **One dark « Tableau »:** Maison (Home, `/`) is the house at a glance: summary chips, what is happening
  now (away, boosts) with the house actions, the alerts, one tile per room with its −/+, the energy and the
  tariff of the moment, tomorrow's grid signals and today's schedule. Four places in the sidebar and the phone
  tab bar: Maison · Programme · Énergie · Réglages.
- **Settings overview:** Réglages (Settings, `/home`) shows the alerts when there are some and one card per
  section (Rooms and devices, Tariff, Linky, Data sources, Account) that summarises it and opens its own page;
  language and technical details are set in place (one dark theme). The house actions live on Maison.
- **Rooms and devices managed from Kelvin** (Settings › Rooms and devices): create, rename and delete
  rooms, move a radiator to another room, rename a radiator. Kelvin writes to your Cozytouch
  setup, so the Cozytouch app shows the same thing. Each radiator reads as its model, power and
  state (« HEKLA P · 1 500 W · En ligne ») with its actions in one « ⋯ » menu. Every device is listed with its room,
  connectivity, last signal and read-only details (model, power, version, signal…). A change is
  shown as done only when Cozytouch reports it; if Cozytouch accepted it but has not confirmed it
  after a minute, it reads « non confirmé » (not failed) and its room name stays reserved until the
  next read settles it. A reserved name, like one already used, cannot be taken again.
  « Annuler » undoes a change for 10 s.
- **Changes made in the Cozytouch app show up.** Device moves and renames at once; room names
  and new rooms within a day (a refresh every night at 04:30), or right away with « Synchroniser »,
  as long as Kelvin's setup-read budget allows it (3 full reads in 24 h). The last read of the 24 h
  is always kept for a restart, so « Synchroniser » can say « not now » with the time it is
  possible again.
- **Rooms at a glance:** one tile per room on Maison with its reading, its state in words (« En chauffe ·
  Confort jusqu’à 23:00 », « Chauffe temporaire jusqu’à 21:45 ») and −/+ for the setpoint in force; offline
  rooms move to the end, calm and without a stale temperature. A room opens its sheet over Maison: the large
  setpoint with −/+ and a slider, the modes, boost written as a sentence (« Chauffer à 22 °C pendant 2 h »,
  and what happens after), today's chart with a legend, the schedule's temperatures, energy and each
  radiator.
- **Control:** off, manual, schedule; setpoint; the weekly schedule (the radiators' own three
  comfort periods a day): the week as an agenda (on a desktop its comfort blocks can be
  dragged and resized in the radiators' steps: 30 minutes on Sauter, the only times they keep), the comfort and eco temperatures and what happens next, and one
  day edited at a time (drag or type the periods, « Copier vers… » weekdays, the weekend or every day; nothing is sent before « Envoyer »;
  an offline room's schedule is shown read-only); boost a room for a few hours (« Chauffe temporaire »); away for the whole house from wherever you are (« Partir en absence » with
  « Demain 18:00 » / « Dimanche 18:00 » presets and the consequence written before sending). Boost and away
  restore what was there before. The night light's brightness (1–100 %). The programme editor
  never writes a day it cannot edit: a day ending at midnight or that Kelvin cannot read is shown
  and kept exactly as the radiator has it, and a programme changed in the Cozytouch app (or
  another browser) since you opened the editor is never overwritten without asking.
- **History:** temperature and setpoint per room, a 24-hour thermal strip, radiator energy from
  their own meters. Overkiz reports a meter only when it moves; Kelvin spreads the energy
  between two readings over the time between them, by the radiator's own heating rate when it
  knows it, and marks such figures as estimates. A reading that cannot be true (above what the
  radiator can draw, or a drop) is never counted as energy, and the time after a meter's last
  change stays unknown until it moves again.
- **Room details:** per radiator its model, power, raw signal level, whether Cozytouch can reach
  it (and since when it cannot) and its last signal; per room the radiators' energy, its cost at
  your prices (energy only) and heating hours for the chart's period, when the window was
  reported open and presence detected, whether the room is heating now and the share of the last
  24 hours it heated.
- **Alerts:** calm in-app notices when regulated prices change (1 February, 1 August) and your
  tariff has no new prices, when the Enedis consent nears its end, when a radiator has been
  unreachable for 30 minutes, when a command failed, when Linky stopped bringing new days, when
  tomorrow is a red Tempo day (Tempo households only), when EcoWatt is orange or red today or
  tomorrow (every household), or when Enedis lists new off-peak hours (with a link to add them
  from a date; Kelvin never changes your tariff by itself). Dismiss one and it stays hidden until
  it happens again.
- **Signed-in devices:** Settings › Account lists the browsers signed in with the home's account and
  signs any of them out.
- **Energy:** answer first — the period's cost (or kWh) with its off-peak/peak split, the
  comparison with the previous period and three key figures (full month, heating share, off-peak
  share) — then the evidence: whole-home consumption from Linky (through MyElectricalData) by day,
  ISO week, month or year, with a period navigator (and a condensed bar once it scrolls away). Every bar, half-hour and figure shows its exact value on
  hover, tap or keyboard: off-peak/peak, radiators and the rest of the home, energy and standing charge €,
  the prices applied. A half-hour scrubber with power and price, max power and baseload, the off-peak/peak
  share, the radiators' share and cost, per room and per radiator (energy, €, temperature,
  heating hours), a room's temperature against its heating, comparisons on comparable days only,
  a month and a 365-day projection, a data-quality panel, and a CSV export of what is shown (from the page
  header's « Exporter » menu)
  (numbers in the UI language: `;` and a decimal comma in French, `,` and a point in English;
  French headers in both). Shown parts add up to their
  total, and a day reads the same € in every view. A missing figure reads « — » with its reason,
  never 0; estimates say so. The bill estimate follows the tariff option, Base, HC/HP (dated and
  seasonal off-peak hours) or Tempo, with an exact price history even across a change of option.
  Under Tempo a day without a known colour keeps its kWh but not its €, and says so.
- **Grid signals:** on Maison (summary chip, « Demain ») and Energy. With a Tempo price row in force,
  today's and tomorrow's Tempo colours (a Tempo day runs 06:00 → 06:00); for every household,
  EcoWatt orange and red days (RTE's grid-strain signal). Settings › Data sources shows when each
  source was last read. Nothing acts on the radiators by itself.
- **French and English.** The whole UI, errors included, in French (the default) or English
  (en-GB, with its own number, date and currency formats), chosen per device in Settings › Display or
  on the sign-in screen, without a reload. A browser in French starts in French, any other
  language in English. URLs are English (`/rooms`, `/schedule`, `/energy`, `/home`, `/home/devices`, `/home/tariff`, `/home/linky`, `/home/sources`, `/home/account`); old
  bookmarks are redirected.
- **Calm by default, real data on demand.** Every figure that has more precision or a source shows it
  one hover, tap or Enter away (its exact value, where it comes from, how fresh, measured or estimated);
  analysis sits behind « Détails ». Settings › Display › « Afficher les détails techniques » brings it up one
  level on that device: detail sections open, the live heating power « ≈ 1,70 kW » beside « En chauffe »,
  each radiator's signal and last event inline.
- **An installable PWA** with an offline shell, one dark theme, 44 px touch targets, checked
  with axe on every screen and for layout shift (CLS < 0.05) from 320 to 1440 px.
- **A simulator** of a whole home and a synthetic Linky, for trying Kelvin and for every test.
  `KELVIN_FAKE_HOUSE=atlantic|thermor|experimental` shows another invented house; without it, the
  house follows the server chosen at login.
- **AI assistants can read your data through MCP, read-only** (see [backend/README.md › MCP](backend/README.md#mcp)).

## Project status

## Project status

Early (0.x). Kelvin is developed against one installation: Sauter IPALA H and HEKLA radiators
on io-homecontrol, with a Cozytouch bridge. Multi-brand: servers and device kinds beyond
Sauter are « expected to work » or « experimental » and untested on real hardware (see
[backend/README.md › Device compatibility](backend/README.md#device-compatibility)); messages that name Cozytouch keep that word on every server. The
UI is in French and English (French by default; switch in Settings › Display, or on the sign-in
screen). The Linky bill estimate supports the Base, HC/HP and Tempo options; Tempo and EcoWatt
are shown on Maison and Energy and raise alerts. AI assistants can read Kelvin's data through a
read-only MCP endpoint, with its tokens in Settings › Account.
