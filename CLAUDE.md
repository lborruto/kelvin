# Kelvin — notes for coding agents

Kelvin is a self-hosted FastAPI + SvelteKit app that controls Sauter radiators through the
Overkiz (Cozytouch) cloud and shows Linky energy from MyElectricalData. `README.md` says what
it does, `CONTRIBUTING.md` how to work on it. This file is the short list of rules the code
depends on.

## Where truth lives

- `PRODUCT.md`: who it is for and the product principles.
- `DESIGN.md`: the design system as built (tokens, components, copy rules in French and
  English). It is the design reference; UI work follows it.
- `docs/glossary.md`: the French ↔ English terms every English string follows; a new term goes
  there first. `docs/i18n-catalogue.md` is the design snapshot behind the dictionaries.
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
- **Overkiz quota:** never call `Gateway.snapshot()` (`GET /setup/places` + `/setup/devices`,
  documented as one call a day) on a timer. Full setup reads go through the one stored
  `SetupReadGuard` (`overkiz/budget.py`, at most 3 per 24 h, kept across restarts); reconcile
  with `device_states(url)` instead (one radiator every 10 minutes). The poller never takes the
  last read of the day; a start never waits for the budget (stored setup structure, else one
  overdraft read a day). Never send `states/refresh`.
- **Radiator energy:** a meter reading is a value at the time Kelvin learned it; rows are
  written only when a counter changes, so an equal value is no reading and proves nothing
  (Overkiz's value can lag the meter). Every radiator kWh comes from `recorder/energy.py`
  (`clean_spans` → `apportion`) through `Recorder` (`energy_buckets`, `radiator_energy`);
  never difference raw rows elsewhere. An absent counter is `NULL`, never 0. T1/T2 are the
  radiator's registers, not HC/HP: radiator HC/HP come from Kelvin's slots per half-hour
  (`billing/radiators.py`).
- **Never invent energy.** `clean_spans` would rather leave a span unknown than count a kWh it
  cannot prove: a jump above the radiator's power (+10 %, +1 min; `FALLBACK_POWER_W` = 5 kW
  when the power is unknown, for plausibility only, never for weights) is skipped, never
  adopted as consumption; a new level that persists is a rebase (never consumption); a large
  increase after a quiet stretch (above 3 h of full power) is held until the next reading
  confirms it, so the latest span may be `null`. The time after a counter's last change is
  `null` until it changes again; once it does, the working-rate samples put the span's energy
  in the heating hours, so idle days inside it read a measured 0.
- **Same bucket, same figure.** Readings are cleaned in fixed, epoch-aligned 28-day chunks
  (`CHUNK_S`), each replaying from 3 days before it (`LOOKBACK_S`), so a bucket's energy never
  depends on the window asked; the hypothesis window property in `tests/test_recorder.py`
  guards it. Keep any change to `clean_spans` or the chunking window-consistent. A complete
  radiator-day (every half-hour inside an emitted span) is final, so the report caches it
  (`linky/radiator_cache.py`); a write that can change a past day (a reading replacing or
  predating its radiator's last one, a sample not after the newest sample and reading, as after
  a wall clock stepped back, pruned samples) must bump `Recorder.energy_epoch`.
- **Report figures:** never pass a partial sum off as whole. In `/api/energy/day`, a
  half-hour's radiator sum (and a room's) is `null` unless every radiator that existed then is
  known (`radiators_known` / `radiators_total`). In the report, a radiator sum may be partial
  and says so with `coverage` (radiator-days fully measured / radiator-days that existed, up to
  yesterday); its kWh, HC/HP and € count exactly the days coverage counts (never today), it is
  `null` only when nothing is known, and « Reste » is the meter minus the radiators only at
  coverage 1 with every day of the bucket present. Coverage, room stats and comparisons count
  only elapsed days; comparisons pair days with Linky data on both sides and give no `change`
  above 20 % of pairs dropped (`comparison.basis` says whether a period is compared unit by
  unit or by its length). No Linky figure, subscription or comparison counts a day before the
  report's first day (the contract start, but not before the daily backfill window unless
  Kelvin stored older days), in the report and in `/api/energy/day` alike; from it on, every
  counted day pays its subscription, with or without data. Radiator figures come from the
  radiators' own meters, not the contract: the report's radiator sums and `by_radiator` count
  them on any day the radiator existed, while the day view shows no intervals before the first
  day.
- **Schema changes** go in `recorder/db.py` `MIGRATIONS`: idempotent, batched, recorded in the
  `schema_version` setting.
- **Bounded work:** API windows are bounded (`_check_span`, `_check_days`: 4 × 366 days at
  most, 62 for hourly radiator buckets, `422 Période invalide.` otherwise), readings stream in pages (`PAGE_ROWS`), and loops
  that delete or migrate work in fixed batches.
- **Restore order:** a restore sets the previous target first, then the mode, in one action. In
  programme mode the target is the remembered manual setpoint.
- **Language:** user-facing strings (errors, labels, UI) exist in French and English and live
  only in `web/src/lib/i18n/fr.ts` and `en.ts` (`en` is typed from `fr`, so a missing key fails
  `npm run check`; `dictionaries.test.ts` checks both take the same parameters); never
  hard-code copy in a component or module. French is the default; English is en-GB and follows `docs/glossary.md`. Both follow
  DESIGN.md "Copy" (French: no-break space before units and `%`; English: `42%`, `€16.20`, never
  "HC"/"HP"; both: `−`, `—` for a missing value, typographic `’`). Messages are never read at
  module scope or in a plain `const`: arrays hold keys or getters and templates or `$derived`
  read `m.*`, so a language switch (no reload) reaches every label. Numbers and dates go through
  `$lib/format`, which follows the active language. The strict scan (`web/scripts/i18n-check.mjs
  --strict`, also run by `npx vitest run`) fails on hard-coded French, an unused key or a
  message read at module scope; a line that must keep a French literal (an upstream device
  default, a data value) is marked `// i18n-ignore: <why>`. Its blind spots are short forms
  that read as English or code (« Prog. », « Lun », « S42 », « 7 j »): `SCANNER_BLIND` in
  `dictionaries.test.ts` lists them, so review those by eye. The CSV export keeps French headers
  and file names in both languages. The PWA manifest is static and stays French. Code, logs and
  docs are English.
- **API errors:** raise a `UserError` code (`backend/kelvin/errors.py`, labels in
  `kelvin/labels.py`); never a bare `HTTPException`. Every error body keeps its French `detail`
  as a fallback and adds `code` and `params`; the web translates by code
  (`web/src/lib/i18n/codes.ts`) and the API never reads `Accept-Language`. Backend French lives
  only in those two files; after adding or changing a code, run
  `cd backend && uv run python scripts/export_codes.py`.
  Params hold keys and figures only: never an id, email, PDL, token or other secret, and
  third-party text (a gateway's message) goes through `errors.scrub` before any API body, SSE
  or log.
- **Paths:** URL paths are English (`/rooms/[id]`, `/schedule`, `/energy`, `/home`; anchors
  `#away`, `#tariff`, `#linky`, `#quality`, `#curve`) and come from `web/src/lib/paths.ts`. Old
  French paths are redirected only by its legacy table and the marked block in `app.html` (a test
  keeps them equal; `scripts/check-paths.mjs` fails on a French path anywhere else).
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
  (e2e checks both). Buttons use the global `.btn-*` classes. Svelte 5 transitions on an element
  that a parent mounts inside its own `{#if}` (ChartInspector) need `|global`, or they never play.
- **Énergie figures:** formatted through the precision functions in `$lib/format.ts` (spec
  §3.2.1), and every inspector, readout, hidden table and announcement built from
  `$lib/inspector.ts`, so a value reads the same everywhere. Shown sums add up: a total shown
  with its parts goes through `matchParts` (largest remainder at the total's decimals). € are
  rounded once, in `billing/report.py`, from running sums anchored on 1 January (a span's cents
  are round(cum(to)) − round(cum(from))); never round a bucket's € on its own, in the backend or
  the web, so a day reads the same figure in Jour, Semaine, Mois, Année and the CSV. A room's
  figures (`billing/room_energy.py`, `GET /api/rooms/{id}/energy`) take each elapsed day's € as the
  sum of its radiators' `by_radiator` € for that day (`report.radiator_shares`), so a room's day
  reads what Par pièce shows; a test pins it. A « — »
  always carries its reason. The Courbe readout's fields stack every text they take over the day
  in one cell, so scrubbing never reflows them; keep that when adding a field. Énergie strings
  live in the `$lib/i18n` dictionaries like every other string (one group per component or
  module: `m.hero`, `m.inspector`, …); the CSV export is a machine contract documented in `web/README.md` (French headers in every locale; `;` and a
  decimal comma in French, `,` and a point in English; no ids, no PDL).
- **Time in tests:** tests that depend on the time of day use the injected clock
  (`create_app(wall=…)` / `start_runtime(wall=…)` in the backend, `EnergieData(now)` in the web),
  never the real hour, so they pass at 00:27 as at 14:00.

## Checks

- backend: `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
- property tests use `hypothesis` (dev dependency); keep their example counts as written.
- web: `cd web && npx vitest run && npm run check && npx playwright test`
- i18n and paths: part of `npx vitest run` (`web/scripts/i18n-check.mjs --strict` and
  `web/scripts/check-paths.mjs` also run alone).
- image (Dockerfile, compose or launcher changes): `bash scripts/docker-smoke.sh`
