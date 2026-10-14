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
- `GET /api/energy/radiators?start=&end=&group=hour|day|month[&radiators=]` — radiator meters only (epoch seconds; `hour` over 62 days at most). Each row: `bucket`, `radiator_id`, `kwh`, `t1_kwh`/`t2_kwh` (`null` when no measured span of that register reaches the bucket: the register is absent, or it has not changed since before the bucket — the time after a counter's last change is unknown until it changes again, so a register that stays flat reads `null`, not 0), `interpolated` (a gap over 3 h fed it), `apportioned` (it holds part of a longer span). Buckets Kelvin knows nothing about are omitted, never 0.
- `GET /api/energy?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|month|year` — Linky + € + projection + heating share (`to` exclusive)
- `GET /api/linky/curve?date=YYYY-MM-DD` — 30-min curve with the off-peak share of each interval
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

Meter readings are written when a counter changes, at the time Kelvin learns it (Overkiz reports counters only on change); energy between two readings is spread over the time between them, by the radiator's working rate when the 5-min samples cover the gap (and the weighted power stays within the radiator's), by time otherwise. A drop to below half the counter is a reset only if the next different reading stays low; a jump above the radiator's power (+10 %, +1 min) is skipped and never becomes the reference. Readings are cleaned in fixed 28-day chunks, each replaying 3 days before it, so a bucket reads the same in any window.

## Notes

- Commands are confirmed by device state, not by Overkiz execution status (see [`docs/overkiz-notes.md`](../docs/overkiz-notes.md)). Every Overkiz call times out after 30 s.
- Kelvin reads the whole Cozytouch setup (`GET /setup/places`, `/setup/devices`, documented as one call a day) only at startup, after an outage and when the password changes, at most 3 times in any 24 h. One budget covers startup, background retries, logins and the poller, and its times are stored in the `overkiz_setup_reads` setting, so a restart cannot reset it. Between those reads Kelvin follows events and re-reads one radiator's device states every 10 minutes. A device whose state read fails is skipped and retried less and less often, at most every 6 h; it never holds up the events.
- Boost and away are managed by Kelvin and stored in SQLite; they survive restarts.
- Scripts in `scripts/` talk to a live installation and write only to `captures/` (gitignored): `capture_fixture.py` is read-only, `med_capture.py` reads MyElectricalData, `overkiz_try.py` executes commands.
