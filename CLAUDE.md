# Kelvin — notes for coding agents

Kelvin is a self-hosted FastAPI + SvelteKit app that controls electric heating through the
Overkiz cloud (Sauter tested on real radiators; Atlantic and Thermor Cozytouch expected; other
Overkiz servers experimental) and shows Linky energy from MyElectricalData. `README.md` says what
it does, `CONTRIBUTING.md` how to work on it. This file is the short list of rules the code
depends on.

## Where truth lives

- `PRODUCT.md`: who it is for and the product principles.
- `DESIGN.md`: the design system as built (tokens, components, copy rules in French and
  English). It is the design reference; UI work follows it.
- `docs/glossary.md`: the French ↔ English terms every English string follows; a new term goes
  there first. `docs/i18n-catalogue.md` is the design snapshot behind the dictionaries.
- `docs/overkiz-notes.md`: Overkiz behaviour verified on real radiators (its « UNVERIFIED » section
  lists what is only expected for other kinds). Read it before adding
  or changing any device command, and record every new verification there (no ids or serials).
- `docs/linky-notes.md`: MyElectricalData behaviour and quotas.
- `backend/README.md` (API, environment) and `web/README.md` (web development).

## The simulator, always

- `KELVIN_FAKE=1` runs the simulator (`backend/kelvin/overkiz/fake.py`, a synthetic Linky in
  `backend/kelvin/linky/fake.py`). Use it for development, demos and every automated test.
  Tests and e2e log in through the real flow with `demo@kelvin.local` / `kelvin`.
- `KELVIN_FAKE_HOUSE` (`sauter`, `atlantic`, `thermor`, `experimental`) picks an invented house;
  empty, the house follows the login server. Every capability set has a house and a test
  (`tests/test_fake_houses.py`). Simulator gateway ids are an allowlist in
  `tests/test_repo_hygiene.py`: use only the invented `io://…` ids already there.
- Tests never contact Overkiz or MyElectricalData: use `FakeGateway`, `FakeLinkySource`,
  `httpx.MockTransport` or a stub client.
- `backend/scripts/` talk to a real installation. Run them only when the human asks and is
  watching, on their own installation. Read-only first; revert any write at once and confirm the
  original state. They write only under `backend/captures/` (gitignored).
- `backend/scripts/places_try.py --write --i-am-watching` is the only thing that writes to the
  Cozytouch setup (a temporary « Kelvin test » place, created, renamed and deleted). Only the
  controller runs it, with the owner watching and Kelvin stopped; the read-only form prints
  counts and types only. Never write to the real radiators from a test or a script.
- Never read `.env`, `account.json`, `backend/captures/` or a real `KELVIN_DATA`. Never put an
  email, password, token, PDL, gateway id, device serial, place id or real reading into code,
  tests, fixtures, docs, screenshots or commit messages.

## Rules the code depends on

- **Sauter commands are pinned byte for byte** by `tests/test_sauter_golden.py` and its fixture
  (`tests/fixtures/sauter_commands.json`, recorded before Plan 12 by `scripts/sauter_golden.py`,
  re-recorded after the Plan 8 and Plan 8b merges, each time identical to `main` + the harness alone).
  Never regenerate the fixture to make a change pass; a diff there is a regression. The script
  refuses to overwrite it without `--force`, and the test pins its SHA-256: a re-record needs its
  own justified commit that also edits `FIXTURE_SHA256`.
- **Devices are classified by `kelvin/devices/registry.py`** (widget, then UI class) with
  pyoverkiz's own names only. A radiator's commands come from its `Profile`; what the UI shows and
  the API accepts comes from `capabilities(r)` (profile ∩ declared commands ∩ allowed values): commands are
  capability-driven. A control a device does not support is absent from the UI and refused by the
  API (`unsupported_command`); a read-only device is never commanded (`read_only_device`); room and
  house commands skip radiators that cannot (`unsupported_in_room` when none can). Unknown heating
  devices, water heaters, heat pumps and everything else are read-only and never hidden. Only
  `setpoint_heater` on the Sauter server is `tested`; record anything verified on another kind in
  `docs/overkiz-notes.md` before changing its support level.
- **One server per home.** The account file stores the Overkiz server; the data folder stores it
  too (`overkiz_server`) and refuses another server's home, like simulator data. The data folder
  is bound to its server: switching server is a fresh install. On experimental servers Kelvin
  never writes the setup (`setup_experimental`) and never calls Atlantic's own APIs.
- **Device state is the source of truth.** A command is done when the expected state arrives.
  Overkiz often reports `FAILED OVERRIDEMODE_ERROR` for commands that did apply.
- **Overkiz quota:** never call `Gateway.snapshot()` (`GET /setup/places` + `/setup/devices`,
  documented as one call a day) on a timer. Full setup reads go through the one stored
  `SetupReadGuard` (`overkiz/budget.py`, at most 3 per 24 h, kept across restarts); reconcile
  with `device_states(url)` instead (one radiator every 10 minutes). The poller never takes the
  last read of the day; a start never waits for the budget (stored setup structure, else one
  overdraft read a day). Never send `states/refresh`.
- **Cozytouch setup writes** go only through the allowlisted client `kelvin/setup/client.py`:
  five writes (create, rename and delete a place; relocate a device; set a device label) and two
  targeted reads. Never add a setup operation without adding it there and to its test; device
  delete, firmware, pairing, metadata and re-parenting stay unreachable. Requests go through the
  pyoverkiz session and are sent once (never `_post`/`_put`/`_delete`: they retry a POST). A write
  is done only when an event or a targeted read (`read_place`) shows it; a sent write not
  confirmed in 60 s is « unconfirmed », never failed, and keeps its label reserved.
- **Setup read budget:** full setup reads for rooms and devices go through `SetupRefresher`
  (`setup/refresh.py`) and the one `SetupReadGuard`: a daily read at 04:30, one after Kelvin's own
  changes, one after a change made in the Cozytouch app, and « Synchroniser » (`POST
  /api/setup/sync`). Every reason leaves the last read of the 24 h for a restart, never one read
  per write (several writes share one read), and a spent budget answers `setup_sync_spent` with
  the next possible time. The device tree is served from memory.
- **Rooms are Cozytouch places:** a radiator's room is its heater's place and its name its
  heater's Cozytouch label (the device name when the label is Overkiz's generic one); Kelvin keeps
  no room mapping of its own.
- **Ids and labels:** device URLs and gateway ids never leave the backend (device ids in the
  API are `<radiator id>#<n>` and `bridge-<n>`). Room ids are Cozytouch place oids, as they
  always were (`rooms[].id`, `room_id`, a setup pending's `room_id`). `GET /api/setup/devices`
  returns device labels as Cozytouch holds them, generic « IO (…#n) » ones included; the web
  shows a generic label, or one holding a serial or a device URL, as the device's role
  (`deviceLabel`, `radiatorName` in `web/src/lib/setup.ts`). Logs and `command_log` carry labels,
  never ids.
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
- **Paths:** URL paths are English (`/rooms/[id]`, `/schedule`, `/energy`, `/home`, `/home/devices`,
  `/home/tariff`, `/home/linky`, `/home/sources`, `/home/account`; anchors `#away`, `#tariff`, `#linky`,
  `#quality`, `#curve`, `#alerts`, `#sessions`) and come from `web/src/lib/paths.ts`. Maison's old
  section anchors land on their sub-page (`homeAnchor`: `/home#tariff` → `/home/tariff`, `#sessions` →
  `/home/account#sessions`, `#away` opens the Absence sheet). Old
  French paths are redirected only by its legacy table and the marked block in `app.html` (a test
  keeps them equal; `scripts/check-paths.mjs` fails on a French path anywhere else).
- **API header:** mutating API routes require the header `X-Kelvin: 1`.
- **Login:** every `/api` route except `/api/auth/*` and `/api/health` needs a session (cookie
  `kelvin_session`), `/api/stream` included. Login is the home's account on its Overkiz server, chosen at the first login
  (`GET /api/auth/servers`).
- **Secrets:** the Cozytouch password and the MED token live only in env vars or
  `$KELVIN_DATA/account.json` (0600): never in logs, API responses, the DB or git. The Linky
  token is write-only; the PDL is never logged.
- **Missing data is `null`, never 0**, in the API, and « — » in the UI.
- **Programme days Kelvin cannot edit** (a slot ending at midnight, any shape it cannot parse or
  does not write: unsorted, not three entries) are locked: `plan_program` re-sends them exactly
  as the radiator reported them, whatever the payload says. Only the days a programme body names
  are written (`[]` clears one); a day it leaves out or lists in `keep` is re-sent as read on
  every radiator it reaches, so « Aussi pour… » (sending to other rooms) or a mixed room never empties a day. The
  editor never makes an end after 23:45. Every editor send carries `base` (each radiator's
  programme when the editor loaded); the backend answers `409 program_changed_elsewhere`
  (`params.days` only) instead of overwriting a change made elsewhere, unless `force`; the editor
  stops a multi-room send at the first 409.
- **Alerts:** a rule is a pure `(context, now) -> list[Candidate]` in `kelvin/alerts/rules.py`;
  keys embed the occurrence (a dismissed alert returns only when its key changes, or when it was
  resolved and comes back); the backend stores kinds and params, never text: the web writes the
  words in both dictionaries (`alertText`).
  A new kind needs its rule, its `alertText` case and its two messages in the same PR. Alert
  params may name Kelvin's own room and radiator ids (already in the house view), never a device
  URL, serial or secret (error params stay id-free).
- **Injected clock everywhere:** the house, the outage demo, alerts, the command service and
  `alert_context(rt, now)` take `wall`; nothing in them reads `time.time()` or `datetime.now()`.
- **A room's € is the sum of its radiators' Par pièce cents** (`report.radiator_shares`, day by
  day), never re-priced or rounded on its own.
- **Device signal:** `House.last_event_ts` is memory only and counts listener events, not state
  reads (`House.apply(…, event=False)` for reads). Reachability comes from `core:StatusState`,
  whether an event or a read brings it (a status change seen by a read starts or ends a run too);
  its timing is memory only. `radiator_unreachable` needs 30 continuous minutes; an outage
  already alerted on keeps its key across restarts (one seen only from a start is keyed
  `startup`), so a dismissal holds until the radiator is seen reachable again.
- **Sessions:** a session's `id` is an opaque random value, never derived from the token or its
  hash; the API lists browser and system names only, never the user agent or the token. The
  current session cannot be signed out through the list.
- **Tariff and pricing:** every € comes from `kelvin/billing/pricing.py` (`Pricing.slice`/`rate`):
  each price row has its own option (`base` | `hchp` | `tempo`), HC/HP days use the dated and
  seasonal schedule of their date, Tempo days the Tempo hours and the colour of the **Tempo day**
  (wall clock: a half-hour starting before 06:00 belongs to the previous day, never `t − 6 h`).
  An unknown Tempo colour prices nothing: its kWh count, its € is null (`missing_colour_days`).
  A day without a complete curve splits by the fallback profile (`billing/split.py`), scaled to the
  daily reading. A v1 tariff setting is migrated on first read (`tariff_v1` keeps the original).
- **MyElectricalData budget:** every MED call (Linky, the monthly contract re-read, the public
  Tempo/EcoWatt endpoints, the Tempo price prefill) goes through `LinkySync.spend(kind=…)`:
  ≤ 10 a Paris day, grid ≤ 4, `backfill` yields to the grid calls still planned. The simulator's
  budget is 14 (`SIMULATOR_EXTRA_CALLS`). Never add a MED call that bypasses it.
- **Grid signals:** a stored Tempo colour never changes (a different colour from MED is logged
  once and ignored: it prices the history). Tempo colours are shown and fetched only when the
  price row in force is Tempo (the API answers `tempo: null` otherwise); EcoWatt is for every
  household. A Tempo switch made after the day's MED budget is spent gets its colours the next
  day. Periodic external calls run as jobs in `kelvin/scheduler.py` (a job returning False made
  no call and keeps its last fetch time); EcoWatt hours are shown while `ECOWATT_HOURS_VERIFIED`.
  Tempo calls only for today's or tomorrow's colour (06:30; 11:15/13:15), the history riding in
  them: a history hole calls by itself only before the last range asked (`tempo_history_asked`),
  so a day MED never returns costs nothing (a test runs a scheduler day with one). The `ecowatt`, `tempo_red_tomorrow` and `hc_changed` rules are
  pure functions in `kelvin/alerts/rules.py`; the grid fetch and the monthly contract re-read ask
  the engine for an evaluation.
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
  `--tempo-*` tokens are used only by `TempoDot` (DESIGN « Tempo day chip »); `--hc` / `--hp` (Tariff
  blues, HC always hatched) only through `SERIES` / `Swatch` on Énergie and the tariff, never a round
  dot. Controls are painted at `--ctl-h` (36 px) with a 44 px hit area (`.hit` / the `.btn` `::before`)
  and sized by the `--w-*` widths, never stretched.
  Every route stays free of serious and critical axe violations in both themes (`e2e/a11y.spec.ts`,
  `@axe-core/playwright`); a new route joins it, `e2e/cls.spec.ts` and `e2e/screens.spec.ts`.
- **Copy** (DESIGN « Copy (French and English) »): short and plain, household words before device words
  (Overkiz terms only in a Fiche or Détails), one term per concept from `docs/glossary.md` (glossary first),
  errors say what happened then what to do. Safety copy keeps its meaning (locked days, offline, absence
  consequence, estimated vs measured). A backend error text changes in `errors.py` and `fr.ts` together
  (`codes.test.ts`); `labels.py` text is the Overkiz execution label pinned by the Sauter golden fixture, so
  a pending label is reworded on the web only (`REWORDED` in `codes.test.ts`).
- **« Détails techniques »** (`$lib/stores/detail.svelte.ts`, `<html data-detail>` before first paint) only
  moves L1/L2 content up one depth (open `detail` disclosures, live power via `livePower`, inline radiator
  facts via `detailFacts`); it never changes a format, adds a panel or shifts the page.
- **Data on demand** (DESIGN « Data on demand: three depths »): L0 the rounded answer on screen, L1 the
  exact value in a Fiche one hover/tap/Enter away, L2 the analysis in a `Disclosure` (`hidden="until-found"`).
  Every exact figure goes through `Fig` (its Fiche) with a Provenance block from `$lib/provenance.ts`
  (Source, Relevé, Nature: mesuré / estimé / projection / calculé / publié); freshness is said with
  `Freshness` + `SourceLine` (`$lib/freshness.ts` cadences), never in ad-hoc words. Their props are
  listed in DESIGN.md « Foundation components: API ».
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
- **MCP is read-only** (Plan 13, `kelvin/mcp/`, spec `2026-10-16-kelvin-mcp-design.md`): no tool,
  resource or prompt may reach a command, override, setup, tariff, Linky-configuration, alert or
  session write, or an Overkiz or MyElectricalData call; the only writes are MCP's own audit rows
  and a token's `last_used`. `tests/test_mcp_guarantees.py` enforces it (an AST rule on
  `kelvin/mcp/` and a spy + database-diff run of everything on every simulator house): a new tool
  goes into its `TOOLS` and `calls_for` in the same PR. Every tool is annotated read-only, runs
  through `Runner` (audit, redaction, two at a time) and returns `shape.envelope` with units and a
  `basis` (`measured`, `computed`, `estimated`, `mixed`, `static`, `unknown`); keys are neutral
  (`offpeak`/`peak`, `shape.neutral`). Tools reuse the services and `api/bounds.py`/`api/views.py`;
  no figure is recomputed except proposal estimates, which say `estimated` and their assumptions,
  and none is given for a setpoint change (no thermal model). MCP text (tool errors, prompts, the
  guide, proposal titles) is English machine text, outside the web dictionaries.
- **MCP tokens:** `kmcp_…`, shown once, only their SHA-256 stored (`mcp_tokens`), accepted only as
  `Authorization: Bearer` on `/mcp` (never on `/api`; `/mcp` never takes the session cookie). The
  gate (`mcp/gate.py`) refuses any `Origin` header, locks a client out after 10 failures in 15 min,
  limits a token to 60 calls a minute and 1 000 an hour, and audits every refusal without token
  material. The SDK (`mcp`, exact pin) runs stateless with JSON responses; `/mcp` takes POST only
  (a GET would open an idle SSE stream); its DNS-rebinding check is off on purpose (TrustedHost +
  Origin refusal replace it).
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
