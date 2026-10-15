# Kelvin backend

FastAPI service that mirrors Sauter Cozytouch radiators (Overkiz cloud) and exposes REST + SSE.

## Develop

    cd backend
    uv sync
    uv run pytest
    KELVIN_FAKE=1 uv run uvicorn --factory kelvin.api.app:create_app --reload --port 8000

`KELVIN_FAKE=1` runs a simulator of a home (no Overkiz or MyElectricalData calls); log in with
`demo@kelvin.local` / `kelvin`. To simulate another layout, copy `tests/fixtures/home_dump.json`
(or your own `captures/home_dump.json`) to `$KELVIN_DATA/fake_home.json`.

## Run it like production

    KELVIN_DATA=./data uv run python -m kelvin

`python -m kelvin` is what the Docker image runs. It binds `KELVIN_HOST:KELVIN_PORT`
(default `127.0.0.1:8000`) and ignores forwarded headers unless `KELVIN_TRUSTED_PROXIES` is
set. It keeps every file it creates private (umask 077). If `KELVIN_DATA` is not writable, or
`account.json` cannot be read, it stops with a one-line message.

Settings come from the environment only. To use a `.env` file (never committed), load it in
the shell:

    set -a && . ../.env && set +a && KELVIN_DATA=./data uv run python -m kelvin

`COZY_USER`/`COZY_PASS` are optional: they create `$KELVIN_DATA/account.json` on the first
start. Without them Kelvin starts in setup mode, and the first login in the browser with the
home's Cozytouch account starts it. If Cozytouch is unreachable at startup, Kelvin serves the
app in mode `offline` and retries in the background (15 s, doubling to 5 min).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| COZY_USER / COZY_PASS | — | Optional bootstrap of the account file |
| MED_PRM / MED_TOKEN | — | Optional fallback for the Linky PDL and token |
| MED_BASE_URL | https://www.myelectricaldata.fr | MyElectricalData API base |
| KELVIN_DATA | ./data | SQLite and runtime files |
| KELVIN_WEB | — | Built SPA directory to serve |
| KELVIN_FAKE | false | Use the simulator |
| KELVIN_DEBUG | false | `1` serves the API docs (`/docs`, `/redoc`, `/openapi.json`), off otherwise |
| KELVIN_HOST / KELVIN_PORT | 127.0.0.1 / 8000 | Bind address of `python -m kelvin` |
| KELVIN_ALLOWED_HOSTS | — | Comma-separated Host allowlist (localhost always passes) |
| KELVIN_TRUSTED_PROXIES | — | Only behind a trusted reverse proxy: its addresses; `*` is refused |
| TZ | Europe/Paris | Time zone for energy buckets and the Linky sync |

## API

- `GET /api/health` and `/api/auth/*` are open; every other route needs the `kelvin_session` cookie and otherwise answers `401 {"detail": "Connexion requise.", "code": "login_required"}`.
- `GET /api/health` → `{"status": "ok" | "degraded" | "setup" | "reauth" | "offline"}` only; `GET /api/status` (session) adds the Overkiz pump status (with `setup_reads_24h`, full setup reads in the last 24 h) and the Linky state.
- `GET /api/overkiz/quotas` — remaining Overkiz quotas (`GET /setup/quotas`), read only when asked, one read at a time, and cached for an hour (a failure for a minute); ids, URLs, emails and account keys are dropped. `503` « Cozytouch injoignable, réessayez plus tard. » or « Quotas indisponibles. ».
- `POST /api/auth/login {email, password}` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/house`
- `GET /api/stream` — SSE; events: `snapshot`, `house`, `pending`, `overrides`, `status`
- `POST /api/rooms/{room}/mode` · `POST /api/rooms/{room}/setpoint` · `POST /api/rooms/{room}/boost`
- `PUT /api/rooms/{room}/program`
- `POST /api/radiators/{id}/mode` · `POST /api/radiators/{id}/setpoint` · `POST /api/radiators/{id}/light` · `POST /api/radiators/{id}/identify`
- `PUT /api/radiators/{id}/program`
- `PATCH /api/radiators/{id}/features`
- `POST /api/house/off` · `POST /api/house/away`
- `DELETE /api/overrides/{id}`
- `GET /api/history?radiators=&start=&end=&step=` — at most 50 radiators, a window from 2000-01-01 to two years ahead of at most 4 × 366 days, at most 10 000 points per radiator, otherwise `422 Période invalide.`; `step` from 300 s to 4 × 366 days (a validation 422 otherwise)
- `GET /api/energy/radiators?start=&end=&group=hour|day|month[&radiators=]` — radiator meters only (epoch seconds; `hour` over 62 days at most). Each row: `bucket`, `radiator_id`, `kwh`, `t1_kwh`/`t2_kwh` (`null` when no measured span of that register reaches the bucket: the register is absent, or it has not changed since before the bucket — the time after a counter's last change is unknown until it changes again, so a register that has stayed flat since reads `null`, not 0; once it changes, idle stretches inside that span read a measured 0 when the working-rate samples cover it), `interpolated` (a gap over 3 h fed it), `apportioned` (it holds part of a longer span), `complete` (measured spans cover the whole bucket: false for the bucket a counter's last change cuts in two, so a figure that is only part of that bucket is never read as a whole one). Buckets Kelvin knows nothing about are omitted, never 0.
- `GET /api/energy?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month|year[&focus=YYYY-MM-DD | &period_from=&period_to=]` — Linky + € + projection + heating share (`to` exclusive). `from`/`to` is the chart window; `focus` (or `period_from`/`period_to`, not both) is the selected period described by `period`, `heating`, `comparison` and `by_radiator`. Weeks are ISO weeks (Monday). `422 Période invalide.` when a date is before 2000-01-01 or more than two years ahead, when `to` is not after `from` (or `period_to` after `period_from`), when a range exceeds 4 × 366 days, when only one of `period_from`/`period_to` is given, or when `focus` comes with them.
  Per bucket, `radiators` gives the radiators' kWh, HC/HP and € (energy only, each half-hour at its own slot and price), whether a gap was `interpolated` or a span `apportioned`, and `coverage` (radiator-days fully measured / radiator-days the radiators existed, up to yesterday; the kWh, HC/HP and € count exactly those days, so today's running day is in none of them); `rest_kwh` is the meter minus the radiators, only at full coverage. `heating` is the radiators' share over the selected period's common days, never clamped (`inconsistent` above 1.02). The radiators' € come from running sums anchored on 1 January, like the meter's (the report needs the radiator-days from 1 January of the window's and the period's first year, at most 365 days more; complete radiator-days, which can no longer change, are kept in memory — `linky/radiator_cache.py`, bounded, dropped on a tariff or radiator power change and when the recorder rewrites history — so a request replays only the days since each counter last moved), so a bucket reads the same in every view and the buckets add up to the period. `by_radiator` covers the selected period, every radiator Kelvin ever recorded included; its € share the period's radiator € by largest remainder, so they add up to it to the cent. Its `temp_avg`, `setpoint_avg` and `heating_hours` cover the period's elapsed days up to the end of yesterday (the days its kWh count), and are null below 50 % sample coverage. A radiator without an energy counter is in neither `radiators` nor `by_radiator`: what it draws stays in `rest_kwh`, and it does not lower `coverage`.
  A bucket's `energy_eur` and `subscription_eur` come in whole cents from running sums anchored on 1 January (a span's cents are round(cum(to)) − round(cum(from)), split at each new year), so a day, week or month reads the same € in every window and view, and any window's buckets add up to the period to the cent; `eur` is the sum of the two lines (as on an invoice), so `energy_eur + subscription_eur = eur`; it is `null` when there is no energy line.
  Each bucket also gives `split_method` (`curve`, or the fallback used for days without a complete curve: `fallback_window` ±15 days, `fallback_month` and `fallback_all` over the complete curve days from 35 days before the day on, so a day splits the same in any window, `slots`), the `prices` rows applied (`rates` by tariff option), `retro_priced` (Linky days before the first price), `present_days`, and `curve` (complete curve days, kWh, peak and base-load watts). `hc_lens` gives, for the selected period, the share of kWh in HC next to the slots' share of the day, the mean price paid and P_hp − P_hc; `boundary_prorated` says an HC slot edge falls inside a half-hour; `quality` sums up estimates and coverage over the chart window (the bars), and `period.quality` gives the same facts over the selected period alone (by day, the window is the 7 days ending on the period's day: the hero and the Qualité facts read `period.quality`). The report reads only the Linky rows it needs (the window, the period and 400 days back; by year, the daily rows of the four previous years too).
  `comparison` pairs each elapsed day of the selected period with the same day of the previous period (`previous`), of last year (`last_year`, the same calendar dates, so by week the weekdays differ; 29 February → 28 February) and of each of the four previous periods (`avg4`, both sides measured on the paired days); only pairs with Linky data on both sides count, and above 20 % of pairs dropped there is no `change`. A selected period that is not one unit of `group` (`basis: "days"`, else `"unit"`) is compared with the runs of as many days just before it. Money compares energy € only. `projection.month` fills missing elapsed days (`filled_days`) at the trailing rate, next to what is measured (`actual_kwh`, `actual_eur`, `actual_energy_eur`), and pays the subscription from the report's first day on; `projection.year` lists 12 months; `projection.rolling` covers the next 365 days from tomorrow, day by day (`per_day_kwh`, `price_eur_kwh`, `method` `seasonal` from last year's months or `linear`). Coverage, room stats and comparisons count elapsed days only, and no Linky figure, subscription or comparison counts a day before the report's first day (the contract start, not before the daily backfill window unless Kelvin stored older days). Radiator figures come from the radiators' own meters: `radiators` and `by_radiator` count every day a radiator existed, before the first day too (`/api/energy/day` shows no intervals there).
- `GET /api/energy/day?date=YYYY-MM-DD[&room=<room id>]` — one day: each interval's energy, mean power, off-peak share (`boundary` when an HC slot edge falls inside it), price and €, the radiators' Wh (and per room; `null` when a radiator that existed then has no figure, with `radiators_known` of `radiators_total`); an interval's `eur` is its measured Wh at its price, not scaled to the daily reading, so the intervals do not add up to the day's billed €; `totals` with the HC/HP of the daily reading (what is billed) next to the curve's own; `power` (peak, P10 base load, night minimum; complete days only); with `room`, its 5-min samples and the overrides active now (whatever the day). A day without a complete curve splits as the report does for that day alone. `counted_from` is the report's first counted day (the contract start, not before the daily backfill window unless Kelvin stored older days; `null` when the contract start is unknown); a day before it reads as the report does: no intervals, `totals` and `power` all `null`, `not_counted: "before_first_day"` (otherwise `null`), and `available` offers no such day. Unknown room: `404 Pièce inconnue.`
- `GET /api/linky/curve?date=YYYY-MM-DD` — 30-min curve with the off-peak share of each interval (the v1 subset; `/api/energy/day` supersedes it)
- `GET /api/settings` · `PUT /api/settings {tariff}` — tariff with price history (`valid_from`)
- `GET /api/settings/linky` · `PUT /api/settings/linky {prm, token?}` — the token is write-only

Every mutating request (POST, PUT, PATCH, DELETE) must send the header `X-Kelvin: 1`, otherwise
it gets `403 {"detail": "En-tête X-Kelvin manquant."}`. This blocks cross-site form posts. GET
routes and the SSE stream do not need it. Every response carries `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`.

Commands return `202 {"pending": …}` and resolve over SSE (`pending` and `house` events). Errors return `422 {"detail": "<French message>"}`.
`DELETE /api/overrides/{id}` may return `202 {"pending": null}` when there is nothing to restore.
An ended boost or away stays listed with `"restoring": true` until the device confirms the restore;
a restore the device does not confirm is retried after 30 s, then less and less often, at most every 30 min.

## Linky (MyElectricalData)

Enter the PDL and the MyElectricalData token in Réglages (or set `MED_PRM`/`MED_TOKEN`). Kelvin
syncs at 08:00 and 14:00 (Europe/Paris), backfills a year of daily data and 30 days of 30-min
curve, then extends the curve back to the contract start (at most 24 months) with spare calls,
and never spends more than 10 calls a day (MyElectricalData allows 50), the PDL/token checks
included. The simulator uses a synthetic Linky and a demo tariff. Verified behaviour:
[`docs/linky-notes.md`](../docs/linky-notes.md).

## Data

`KELVIN_DATA` holds `account.json` (0600) and `kelvin.db`: samples (kept 400 days), radiator
meter readings (kept), Linky data, tariffs, sessions, overrides and the command log (90 days). The schema version is the `schema_version` setting; migrations run at startup in batches and are idempotent. v1 (Plan 5) stores an absent meter register as `NULL` and keeps the readings as they were in `energy_v0`.

Meter readings are written when a counter changes, at the time Kelvin learns it (Overkiz reports counters only on change); energy between two readings is spread over the time between them, by the radiator's working rate when the 5-min samples cover the gap (and the weighted power stays within the radiator's), by time otherwise. A drop to below half the counter is a reset only if the next different reading stays low; a jump above the radiator's power (+10 %, +1 min; 5 kW when the power is unknown, for plausibility only) is skipped, and becomes the new reference (never consumption) only when the counter then moves on from it plausibly (a replaced meter, a glitched reference); while such a jump is pending, a later reading at or above it is judged against the jump however late it comes, so a long flat gap never turns the jump into consumption. Until a span is accepted from it, a reference is unconfirmed: a lower level that persists (the next reading moves on from it plausibly) replaces it, so a glitch too high cannot stall counting. An increase above 3 h of full power (plausible only over a long gap) waits for the next reading: counted when that reading moves on from it plausibly, dropped as a glitch otherwise, so a glitch after a quiet stretch never lands in the idle days (the latest such reading stays unknown until then). Readings are cleaned in fixed 28-day chunks, each replaying from 3 days before it, anchored at the first reading of the value the counter held then (and the change before it), so a bucket reads the same in any window and repeated legacy rows are counted once.

## Notes

- Commands are confirmed by device state, not by Overkiz execution status (see [`docs/overkiz-notes.md`](../docs/overkiz-notes.md)). Every Overkiz call times out after 30 s.
- Kelvin reads the whole Cozytouch setup (`GET /setup/places`, `/setup/devices`, documented as one call a day) only at startup, after an outage and when the password changes, at most 3 times in any 24 h. One budget covers startup, background retries, logins and the poller, and its times are stored in the `overkiz_setup_reads` setting, so a restart cannot reset it (the simulator, which never calls Overkiz, keeps it in memory only). The poller resyncs after an outage with a full read only while two are left, otherwise device by device, so the last read stays for a restart. A start is never held up by the budget: when it is spent, Kelvin builds the house from the stored structure of the last full read (the `overkiz_setup` setting: places and devices, no states) and reads every device's states one by one; with nothing stored it reads the setup anyway, once per 24 h at most, and logs a warning. Between those reads Kelvin follows events and re-reads one radiator's device states every 10 minutes. A device whose state read fails is skipped and retried less and less often, at most every 6 h; it never holds up the events.
- Boost and away are managed by Kelvin and stored in SQLite; they survive restarts.
- Scripts in `scripts/` talk to a live installation and write only to `captures/` (gitignored): `capture_fixture.py` is read-only, `med_capture.py` reads MyElectricalData, `overkiz_try.py` executes commands.
