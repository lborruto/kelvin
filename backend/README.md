# Kelvin backend

FastAPI service that mirrors Sauter Cozytouch radiators (Overkiz cloud) and exposes REST + SSE.

Contents: [Develop](#develop) · [Run it like production](#run-it-like-production) ·
[Docker configuration](#docker-configuration) · [First login](#first-login) ·
[Device compatibility](#device-compatibility) · [Environment](#environment) · [API](#api) ·
[MCP](#mcp) · [Linky](#linky-myelectricaldata) · [Data](#data) · [Notes](#notes).

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

## Docker configuration

What a self-hoster sets in the Docker image (the next section lists the same variables for
`python -m kelvin` outside Docker, with their defaults there).

The example `docker-compose.yml` builds the image from the repository (`build: .`). Once a
release is published, you can pull the image instead of building it: replace `build: .` with the
commented `image: ghcr.io/lborruto/kelvin:latest` line.

The simulator (`KELVIN_FAKE=1`) needs no account. A data volume belongs to one home: Kelvin
refuses to connect a Cozytouch account to a data directory that holds simulator data, and the
simulator refuses a data directory that holds real readings. Give a simulator run its own
`KELVIN_VOLUME`, `KELVIN_PORT` and `COMPOSE_PROJECT_NAME`.

All settings are environment variables, and every one is optional. `.env.example` lists them.
The compose file reads these from `.env` (or the shell):

| Compose variable | Default | Meaning |
|---|---|---|
| `KELVIN_BIND` | `127.0.0.1` | Host address the port is published on: this machine only. To reach Kelvin from the LAN, set the host's LAN address (or `0.0.0.0`) and `KELVIN_ALLOWED_HOSTS` |
| `KELVIN_PORT` | `8070` | Host port (inside the container Kelvin listens on 8080) |
| `KELVIN_VOLUME` | `kelvin_data` | Docker volume holding the data |
| `KELVIN_ALLOWED_HOSTS` | — | Host allowlist; with none, Kelvin warns when it listens beyond loopback and when reached by another name |
| `KELVIN_FAKE`, `KELVIN_FAKE_HOUSE` | `0`, — | The simulator (`KELVIN_FAKE=1 docker compose up`) |
| `TZ` | `Europe/Paris` | Time zone |
| `COMPOSE_PROJECT_NAME` | `kelvin` | Compose's own: a second copy on the same host needs its own |

Add any other variable below to `environment:` in `docker-compose.yml`. No password or token belongs in the compose file or in
`.env`: you log in with the Cozytouch account in the browser and connect Linky in Réglages › Linky, and
Kelvin keeps both in `account.json` (0600) in its data volume.

| Variable | Default in the image | Meaning |
|---|---|---|
| `TZ` | `Europe/Paris` | Time zone for schedules, energy days and the Linky sync |
| `COZY_SERVER` | `sauter_cozytouch` | The home's Overkiz server (`atlantic_cozytouch`, `thermor_cozytouch`, or an experimental server id); read only when `COZY_USER`/`COZY_PASS` create the account file |
| `COZY_USER`, `COZY_PASS` | — | Advanced, unattended setup only: create the account file on the first start instead of the first login (Compose interpolates `$`: write it as `$$`) |
| `MED_PRM`, `MED_TOKEN` | — | Advanced: fallback Linky PDL and token; Réglages › Linky wins |
| `KELVIN_DATA` | `/data` | SQLite database and `account.json` |
| `KELVIN_WEB` | `/app/web` | The built web app served next to the API |
| `KELVIN_HOST`, `KELVIN_PORT` | `0.0.0.0`, `8080` | Bind address inside the container (outside Docker: `127.0.0.1`, `8000`); not Compose's `KELVIN_PORT` above |
| `KELVIN_ALLOWED_HOSTS` | — | Comma-separated Host allowlist; `localhost` always passes |
| `KELVIN_TRUSTED_PROXIES` | — | **Only behind a trusted reverse proxy:** its exact addresses |
| `KELVIN_MCP` | `true` | `false` removes the read-only MCP endpoint at `/mcp` (see [AI assistants](#mcp)) |
| `KELVIN_FAKE` | `0` | `1` runs the simulator |
| `KELVIN_FAKE_HOUSE` | — | Simulator only: `sauter`, `atlantic`, `thermor` or `experimental` shows another invented house (pilot-wire heaters, towel dryers, a water heater, a heat pump…); empty, the house follows the server chosen at login |
| `KELVIN_DEBUG` | `0` | `1` serves the API docs at `/docs` |
| `MED_BASE_URL` | `https://www.myelectricaldata.fr` | MyElectricalData API base |

`GET /api/health` (open, used by the healthcheck) answers `{"status": …}`:
- `ok`: running;
- `degraded`: Cozytouch is not answering right now;
- `setup`: waiting for the first login;
- `reauth`: the stored password was refused;
- `offline`: Cozytouch was unreachable at startup, and Kelvin retries every 15 s to 5 min.

## First login

Log in with the email and password of the home's Cozytouch account (the one the Cozytouch app
uses). Kelvin checks them with Cozytouch, stores them, and loads your rooms and radiators. The
login screen says so on a fresh install (“First sign-in: this account becomes the home's
account.”). It names the server on one line, Sauter Cozytouch by default: choose **Change**
(**Changer**) to pick Atlantic or Thermor Cozytouch or an experimental server before this first
login; afterwards the server is fixed. The eye button in the password field shows the password
while you type it.
Anyone in the household logs in with the same account. If the Cozytouch password changes,
Kelvin shows “Cozytouch password changed: sign in again” (« Mot de passe Cozytouch modifié :
reconnectez-vous » in French); log in once with the new one.

## Device compatibility

Kelvin talks to the Overkiz cloud through [pyoverkiz](https://github.com/iMicknl/python-overkiz-api).
It has been tested on real hardware with Sauter radiators on the Sauter Cozytouch server only.
Everything else follows pyoverkiz's device definitions and Home Assistant's Overkiz mapping and has
**not** been tried on a real device (see the « UNVERIFIED » section of
[docs/overkiz-notes.md](../docs/overkiz-notes.md)).

| Server (chosen at the first login) | Device | Status | What Kelvin offers |
|---|---|---|---|
| Sauter Cozytouch | Sauter IPALA, HEKLA (adjustable setpoint) | **Tested on real hardware** | Everything: modes, setpoints, programme, boost, away, night light, window and presence detection, energy |
| Sauter, Atlantic or Thermor Cozytouch | Other radiators with an adjustable setpoint (`AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint`) | Expected to work | The same, as far as the radiator declares each command |
| Sauter, Atlantic or Thermor Cozytouch | Pilot-wire radiators (`AtlanticElectricalHeater`) | Expected to work | Level only (Confort, Confort −1/−2, Éco, Hors-gel, Arrêt); no setpoint, programme, boost or away |
| Sauter, Atlantic or Thermor Cozytouch | Towel dryers (`AtlanticElectricalTowelDryer`) | Expected to work | Modes, manual setpoint, boost, drying, boost/away; not their programme |
| Somfy (Europe, North America, Oceania), Hitachi Hi Kumo, Flexom, Nexity Eugénie, Brandt Smart Control, Hexaom HexaConnect, SIMU LiveIn2, Ubiwizz | The same three kinds | Experimental | Heating only |
| Any server | Other heating devices, water heaters, heat pumps, anything that does not heat | Read-only | Listed with their room and connectivity, never hidden, never commanded |
| Rexel Energeasy Connect, Somfy multi-site accounts | — | Not supported | Their login is not an email and a password in pyoverkiz |

If your home works (or does not) with a device marked « expected » or « experimental », please open
an issue with the device's widget name, never your ids.

Known limitation: messages that name Cozytouch (« Cozytouch injoignable ») keep that word on every
server, including the experimental ones.

### Changing server

The server is part of the home's account and is chosen at the first login. To move Kelvin to
another server, stop it, start it on a new, empty `KELVIN_DATA` (or move the old folder away) and
log in choosing the new server: a server change is a fresh install. A data folder never mixes two
servers' homes: Kelvin refuses (« Ce dossier de données appartient à une maison reliée au serveur … »).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| COZY_USER / COZY_PASS | — | Optional bootstrap of the account file |
| COZY_SERVER | sauter_cozytouch | The home's Overkiz server: `atlantic_cozytouch`, `thermor_cozytouch`, or an experimental server id from `kelvin/overkiz/servers.py`. Read only when `COZY_USER`/`COZY_PASS` create `account.json`, which stores it |
| MED_PRM / MED_TOKEN | — | Optional fallback for the Linky PDL and token |
| MED_BASE_URL | https://www.myelectricaldata.fr | MyElectricalData API base; also serves the public Tempo and EcoWatt endpoints (tests only) |
| OPEN_METEO_FORECAST_URL / _HISTORICAL_URL / _ARCHIVE_URL / _GEOCODING_URL | https://api.open-meteo.com, https://historical-forecast-api.open-meteo.com, https://archive-api.open-meteo.com, https://geocoding-api.open-meteo.com | Open-Meteo hosts for the outdoor weather (tests only) |
| KELVIN_DATA | ./data | SQLite and runtime files |
| KELVIN_WEB | — | Built SPA directory to serve |
| KELVIN_FAKE | false | Use the simulator |
| KELVIN_FAKE_SETUP_FAIL | — | Simulator only: comma-separated setup operations that always fail (`create_place`, `update_place`, `delete_place`, `relocate_device`, `rename_device`), for trying the error paths |
| KELVIN_FAKE_HOUSE | — | Simulator only: `sauter`, `atlantic`, `thermor` or `experimental`. Empty: the house of the server chosen at login (Sauter unless another is chosen). A `fake_home.json` in `KELVIN_DATA` still wins |
| KELVIN_SIM_HISTORY_DAYS | 45 | Simulator only: days of radiator history seeded at the first start |
| KELVIN_SIM_WEATHER_COUPLING | true | Simulator only (the Sauter demo house): the demo meter and rooms follow the simulated outdoor temperature, with a three-day absence, so « Météo et coût » has something to show |
| KELVIN_DEBUG | false | `1` serves the API docs (`/docs`, `/redoc`, `/openapi.json`), off otherwise |
| KELVIN_MCP | true | The read-only MCP endpoint at `/mcp`, on by default but inert: nothing is reachable without a token created in Réglages › Compte › Accès MCP (none exists after install); `false` removes the endpoint |
| KELVIN_HOST / KELVIN_PORT | 127.0.0.1 / 8000 | Bind address of `python -m kelvin` |
| KELVIN_ALLOWED_HOSTS | — | Comma-separated Host allowlist (localhost always passes) |
| KELVIN_TRUSTED_PROXIES | — | Only behind a trusted reverse proxy: its addresses; `*` is refused |
| TZ | Europe/Paris | Time zone for energy buckets and the Linky sync |

## API

- `GET /api/health` and `/api/auth/*` are open; every other route needs the `kelvin_session` cookie and otherwise answers `401 {"detail": "Connexion requise.", "code": "login_required", "params": {}}`.
- `GET /api/health` → `{"status": "ok" | "degraded" | "setup" | "reauth" | "offline"}` only; `GET /api/status` (session) adds the Overkiz pump status (with `setup_reads_24h`, full setup reads in the last 24 h) and the Linky state. `sources` gives each grid source's `state` (`off`, `never`, `ok`, `error`, `quota`), `last_ok`, `error_since`, `next` and, under `med`, the day's MyElectricalData calls (`calls_today`, `grid_calls_today`, `budget`). `weather` (null only before login) gives the forecast job's state with `enabled` (a place is set), `backfill` (the backfill job's state), `calls_today` (Open-Meteo weighted calls today) and `budget` (400).
- `GET /api/grid` — `{tempo, ecowatt, source}`: `tempo` (`today`/`tomorrow` `{date, colour}`, `tomorrow.expected_at` while unpublished, `fetched_at`) only when the price row in force today is Tempo, else null; `ecowatt.days[]` `{date, level 1–3, hours}` for today and the next three days (`hours` the level-2/3 runs, dated by their own timestamps; null when the day has none). SSE `grid` carries the same object after every fetch, and the snapshot has it. Tempo is fetched at 06:30 (today missing), 11:15 and 13:15 (tomorrow missing) only when the tariff has a Tempo row, the history riding in those calls (a missing history day calls by itself only once, when it lies before the last range asked); EcoWatt at 07:15 and 17:15; every call comes from the MyElectricalData ledger (at most 4 grid calls a day).
- `GET /api/weather` → `null` without a place, else `{now: {temperature_c, apparent_c, humidity_pct, at, model} | null, today: {min_c, min_at, min_ahead, max_c, max_at, max_ahead, hours} | null, fetched_at, mode, fetch: {state, next, error_since}}` (never the place or its coordinates; SSE `weather` and the snapshot carry the same). `GET /api/weather/hourly?start=&end=` (epoch s, ≤ 31 days) → `{step: 3600, points: [{ts, t, model}]}`, past hours only. `POST /api/weather/search {q, lang: fr|en}` (a POST so the typed text never sits in a URL or an access log; the access log also drops the query string of every `/api/weather…` request) → `{results: [{name, admin1, admin2, country_code, lat, lon, elevation_m}]}` (≤ 8, French first, 0.01°; `422 weather_search_invalid`, `429 weather_search_busy` above 30 an hour or 200 a day, `503 weather_unavailable`). `GET /api/settings/weather` → `{location, coverage: {first_day?, last_day?, complete_days?, from, pending} | null, calls_today, budget, attribution}` (`pending`: a history range is still to be asked); `PUT /api/settings/weather {lat, lon, elevation_m?, name?, admin1?, admin2?, country_code?, origin}` (`422 weather_location_invalid`, `weather_elevation_invalid`; never an input in the error); `DELETE /api/settings/weather` (204) removes the place, every weather row and the jobs' state (the day's call ledger stays: calls already made today still count). Model codes: `arome_hd`, `arpege`, `era5_land`, `best_match` (a day mixing them: `mixed`); the simulator tags its invented hours with the same codes.
- `GET /api/overkiz/quotas` — remaining Overkiz quotas (`GET /setup/quotas`), read only when asked, one read at a time, and cached for an hour (a failure for a minute); ids, URLs, emails and account keys are dropped. `503` « Cozytouch injoignable, réessayez plus tard. » or « Quotas indisponibles. ».
- `POST /api/auth/login {email, password, server?}` · `POST /api/auth/logout` · `GET /api/auth/me`. `server` is an id from `GET /api/auth/servers`; left out, it is the home's server once claimed, else `sauter_cozytouch` (given as `null` or blank it is `422 server_unknown`). The first login claims the home with its server; afterwards another server answers `409 server_mismatch`, and a first login on a data folder that holds another server's home answers `409 data_other_server`. Outside the Cozytouch servers a refused password answers `401 bad_credentials_server` naming the server. `GET /api/auth/servers` (open) lists `{id, name, tier, default}` and `current`, the home's server once claimed (never its email). `GET /api/auth/me` gains `server` (`{id, name, tier, default}` or `null`).
- `GET /api/sessions` — signed-in devices `[{id, created, last_seen, browser, os, current}]`, most recent first: an opaque random id (never derived from the token or its hash), the browser and system names parsed from the user agent (brand names, `null` when unknown); never a hash or the raw user agent. `DELETE /api/sessions/{id}` — sign one out (204; the current one: `409 session_is_current`, sign out instead; unknown: `404 session_unknown`). `POST /api/sessions/revoke-others` — `{revoked}`, every other device; the current session is kept. A revoked session's next request answers 401 and its stream closes at its next session check (within 30 s). Schema v2 adds the ids (`recorder/db.py` `MIGRATIONS`).
- **Session lifetime:** a session lasts one year, sliding: each use moves its expiry, and one unused for a year is deleted. That is on purpose for a household app on phones and wall tablets, so nobody is asked for the Cozytouch password again. The cookie `kelvin_session` is `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS; only the token's hash is stored. Sign a lost device out in Réglages › Compte › « Appareils connectés », or every other device at once with « Déconnecter les autres appareils » (`POST /api/sessions/revoke-others`).
- `GET /api/mcp/tokens` → `{enabled, endpoint_path, tokens: [{id, name, hint, scope, created, last_used, revoked_at}]}` (never a secret); `POST /api/mcp/tokens {name}` → `201 {token, secret}` — the secret `kmcp_…` is shown only in this response (`Cache-Control: no-store`); only its SHA-256 is stored; 1–40 characters (`422 mcp_token_name_invalid`), at most 10 live tokens (`409 mcp_token_limit`), `409 mcp_disabled` when `KELVIN_MCP=false`. `DELETE /api/mcp/tokens/{id}` revokes at once (`204`; `404 mcp_token_unknown`); revoked tokens are listed 90 days. `GET /api/mcp/audit?limit=1…200` → the newest MCP calls `[{at, token_name, kind, name, outcome, error_code, duration_ms}]` (kept 90 days; above 20 000 rows the heaviest source is pruned first, each keeping its newest 200).
- `GET /api/house` — each room has `is_root` (the house itself, holding radiators that are in no room). A radiator's `name` is its heater's Cozytouch label (or its device name when the label is Overkiz's generic one), and its `room_id` is the place its heater is in. Each radiator also has `reachable` (from `core:StatusState`, `null` when not reported), `unreachable_since` (when Kelvin saw it become unreachable, `null` if unknown) and `last_event_at` (last state event from any of its devices since start, `null` before the first). Each room has `presence` (`null` when no sensor reports). Each radiator's `program` lists its readable days (a slot ending at midnight reads `24:00`); `program_locked` maps a day Kelvin will not edit to `midnight` or `unrecognised`. A readable day not in the exact shape Kelvin writes (its slots sorted by start, `start` before `end`, then empty markers, three entries) is `unrecognised` too, so a send never rewrites what Kelvin did not write. A programme send never changes a locked day: it is re-sent exactly as the radiator reported it. The simulator's « Chambre 1 » has an unrecognised Saturday (four comfort slots) and a Sunday ending at midnight. The simulator starts with « Chambre 2 » unreachable since 45 min before start, back 2 h after. Each radiator has `kind` (`setpoint_heater`, `pilot_wire_heater`, `towel_dryer`, `heater_unknown`), `support` (`tested`, `expected`, `experimental`, `readonly`), `capabilities` (`modes`, `manual`/`comfort`/`eco` ranges or `null`, `levels`, `program`, `program_step_minutes` (the programme times the radiator keeps: 30 on every kind until a finer step is verified; `null` without `program`), `dryer`, `window_detection`, `presence_detection`, `night_light`, `night_light_intensity`, `identify`, `energy`, `boost`, `rename` (a label write: every radiator that is not read-only, `false` on an experimental server), `read_only`) and `dryer` (a towel dryer's `boost`/`drying`, else `null`). A read-only radiator is listed with its readings, never hidden.
- `GET /api/stream` — SSE; events: `snapshot`, `house`, `pending`, `overrides`, `status`, `alerts` (`{active, highest}` whenever the active count or the highest severity changes; also in the snapshot and `GET /api/house`), `layout` (the house and the device tree after a placement, label or sync change), `grid` (as `GET /api/grid`), `weather` (as `GET /api/weather`, `null` when the place is removed)
- `GET /api/alerts?state=active|all` — `[{id, kind, severity, params, first_seen, last_seen, resolved_at, dismissed}]`, highest severity first, newest first (`active`: not resolved, not dismissed). Kinds and params only, the web writes the words; params may name Kelvin's own room and radiator ids, never a secret. `POST /api/alerts/{id}/dismiss` — 204; dismissing hides that occurrence only (the key embeds it), so a new occurrence shows again; unknown: `404 alert_unknown`. Alerts are evaluated every 5 min and soon after the events that matter; resolved alerts are kept 90 days. Kinds: `price_change` (info, `{date}`: from 15 days before to 45 days after 1 February and 1 August, without a price row from that day), `consent_expiring` (`{date, days}`: warn at 30 days or fewer, bad at 7 or fewer or expired), `radiator_unreachable` (bad, `{radiator_id, room_id, since}`: `core:StatusState` unavailable for 30 continuous minutes; `since` null when it began before Kelvin started), `command_failed` (bad, `{pending_id, at, label_code, label_params, error_code, error_params, reason_code}`, one per failed command for 24 h, read from the command log so it survives a restart), `linky_stalled` (warn, `{last_day, days}`: no new Linky day for 4 days, unless quota or throttling with a successful call in the last 24 h). Grid kinds: `tempo_red_tomorrow` (warn, `{date}`: the price row in force tomorrow is Tempo and tomorrow is red), `ecowatt` (warn at level 2, bad at 3, `{date, level, hours}`: today or tomorrow, for every household with or without a tariff; the level is in the key, so a dismissed orange that turns red shows again; `hours` are the runs at level 2 or 3, `[{start, end, level}]`, null while their dating is unverified), `hc_changed` (info, `{slots: [{start, end}]}`: the monthly contract re-read gives off-peak hours that differ from today's and from any later schedule's for this month; the web offers to add them from a date). The grid fetch and the contract re-read ask for an evaluation at once. Schema v3 adds the codes to the command log.
- `POST /api/rooms/{room}/mode` · `POST /api/rooms/{room}/setpoint` · `POST /api/rooms/{room}/boost`
- `PUT /api/rooms/{room}/program` — and `PUT /api/radiators/{id}/program` — take the days to write (a day named with `[]` is cleared; a day left out, or listed in `keep`, is re-sent exactly as each radiator reported it, so a send to several rooms or radiators never empties a day it does not mean to change), optional `base` (radiator id → the `program` the editor started from, at most 50) and `force`. With a `base` that no longer matches a radiator's programme (changed in the Cozytouch app or another tab), the answer is `409 program_changed_elsewhere` with `params.days` (the day keys that differ; never a radiator id) and nothing is sent; `force: true` sends anyway. Without `base`, nothing is checked. A new time off the radiator's step (17:45 on a Sauter radiator, which keeps 30-minute times) answers `422 program_step` (`params.day`, `value`, `minutes`) before anything is sent, unless the radiator already holds that time somewhere in its week (it evidently keeps it).
- `GET /api/rooms/{id}/energy?days=1…31` (default 1) — the room's radiator energy over the last `days` local days, today included (`from`, `to` ISO days; the window runs from `from` 00:00 to now): `kwh`, `hc_kwh`, `hp_kwh`, `eur` (energy only, in whole cents), `heating_hours` (full-power equivalent, the mean over the room's radiators as in Par pièce; `null` under 50 % sample coverage of any radiator), `coverage` (elapsed days only, `null` with none), `interpolated`, `apportioned`, `priced`; unknown values are `null`. The elapsed days are the same RadiatorDay figures as `GET /api/energy` (one radiator cache serves both), and each one's € is the sum of the room's radiators' `by_radiator` € for that day (the report's running-sum cents shared by largest remainder), so a room's day reads what Énergie's Par pièce shows for it and windows add up to the cent (30 days − 7 days is exactly the 23 earlier days). Today's measured half-hours enter the house's running sum as its last point, never rounded on their own. A window is the sum of its days: `days=7`/`days=30` are rolling windows ending today, so they can differ by a few cents from the Semaine or Mois Par pièce row (a different span, allocated once over the whole period; each figure is exact for its own span). Its `heating_hours` follow Par pièce's mean rule over the window's own span, today included. Every option prices it: each half-hour by `Pricing` (its option, slots or Tempo hours, its Tempo day's colour); under Base `hc_kwh`/`hp_kwh` are null, and a day without € (no Tempo colour; a day before the first price row is priced by it) is left out of `eur`, as in Énergie's radiator block: `eur` is the priced days' € (the sum of the room's Par pièce rows over those days) and `missing_colour_days` counts the days left out (their kWh and HC/HP stay; `eur` is null only when no day of the window is priced). Its last key, `weather`, is the room's heating model from the 365-day fit (as an item of `GET /api/energy/weather` `rooms`, plus `balance_point_c` and `balance_point_source`; it does not depend on `days`), `null` without a weather place. Unknown room: `404 room_unknown`; `days` outside 1…31: `422 invalid_request`.
- `GET /api/rooms/{id}/activity?start=&end=` — window-open and presence runs the radiators reported, the union over the room's radiators clipped to the window: `{step: 300, window: [{start, end, open}], presence: [...]}` (epoch seconds, edges ±5 min; a run ends at the next 0, or one step after its last 1 on a null sample or a gap over 15 min; `open` when still going at the window's end). `end` is clamped to now; a window before 2000-01-01, empty or over 31 days: `422 period_invalid`. Unknown room: `404 room_unknown`.
- `GET /api/rooms/duty[?since=<epoch s>]` — each room's heating duty over the last 24 h (or since `since`, at most 25 h back; the room panel asks from local midnight, the window of its kWh, € and heating hours; `422 period_invalid` when `since` is not before now): `{from, to, rooms: {room_id: {duty, coverage}}}`; `duty` 0–1 is the power-weighted mean of its radiators' mean working rate (unknown power weighs as the mean of the known), `null` when any radiator has under 50 % sample coverage; `coverage` is the lowest of its radiators'. The simulator seeds a window run every morning in « Chambre 1 » (07:30–07:50) and presence every evening in the « Salon » (18:00–22:30).
- `POST /api/radiators/{id}/mode` · `POST /api/radiators/{id}/setpoint` · `POST /api/radiators/{id}/identify`
- `POST /api/radiators/{id}/light {on, intensity?}` — `intensity` (1–100) sends `setIntensity` after `on`, labelled `night_light_intensity`, and is done when `core:LightIntensityState` reports it (unverified on a real radiator: `docs/overkiz-notes.md`). Codes: `intensity_light_off` (intensity with the light off), `intensity_range` (outside 1–100, worded rather than a schema bound).
- `POST /api/radiators/{id}/level {level}` — a pilot-wire heater's level (`comfort`, `comfort-1`, `comfort-2`, `eco`, `frostprotection`, `off`, among the device's allowed values). `POST /api/radiators/{id}/dryer {action}` — a towel dryer's `boost`, `drying` or `stop`. Both expected to work, not verified on real hardware. Room and house commands go to the radiators whose `capabilities` support them and skip the others; none → `422 unsupported_in_room`. A read-only device refuses every command (`422 read_only_device`). Away and boost cover radiators with `capabilities.boost`.
- `PATCH /api/radiators/{id}/features`: `name` (alone) sets the heater's Cozytouch label (a setup write; a read-only device answers `422 read_only_device`); the toggles stay device commands.
- `POST /api/house/off` · `POST /api/house/away`
- `DELETE /api/overrides/{id}` (an override in the house view or SSE `overrides`: `id`, `kind` `boost`|`away`, `room_id`, `radiator_ids`, `temperature`, `ends_at`, `restoring`, `created_at` — epoch s, `null` for one stored before it was kept)
- `GET /api/history?radiators=&start=&end=&step=` — at most 50 radiators, a window from 2000-01-01 to two years ahead of at most 4 × 366 days, at most 10 000 points per radiator, otherwise `422 Période invalide.`; `step` from 300 s to 4 × 366 days (a validation 422 otherwise). One row per radiator and `step` bucket (epoch-aligned; a bucket without samples is omitted): `ts`, the mean `temperature`, `setpoint` (effective) and `target`, `temperature_min`/`temperature_max`, the mean `working_rate` (% of full power), and the `modes` and `levels` seen in the bucket (sorted lists, empty when none was recorded); a missing value is `null`
- `GET /api/energy/radiators?start=&end=&group=hour|day|month[&radiators=]` — radiator meters only (epoch seconds; `hour` over 62 days at most). Each row: `bucket`, `radiator_id`, `kwh`, `t1_kwh`/`t2_kwh` (`null` when no measured span of that register reaches the bucket: the register is absent, or it has not changed since before the bucket — the time after a counter's last change is unknown until it changes again, so a register that has stayed flat since reads `null`, not 0; once it changes, idle stretches inside that span read a measured 0 when the working-rate samples cover it), `interpolated` (a gap over 3 h fed it), `apportioned` (it holds part of a longer span), `complete` (measured spans cover the whole bucket: false for the bucket a counter's last change cuts in two, so a figure that is only part of that bucket is never read as a whole one). Buckets Kelvin knows nothing about are omitted, never 0.
- `GET /api/energy?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month|year[&focus=YYYY-MM-DD | &period_from=&period_to=]` — Linky + € + projection + heating share (`to` exclusive). `from`/`to` is the chart window; `focus` (or `period_from`/`period_to`, not both) is the selected period described by `period`, `heating`, `comparison` and `by_radiator`. Weeks are ISO weeks (Monday). `422 Période invalide.` when a date is before 2000-01-01 or more than two years ahead, when `to` is not after `from` (or `period_to` after `period_from`), when a range exceeds 4 × 366 days, when only one of `period_from`/`period_to` is given, or when `focus` comes with them.
  Per bucket, `radiators` gives the radiators' kWh, HC/HP and € (energy only, each half-hour at its own slot and price), whether a gap was `interpolated` or a span `apportioned`, and `coverage` (radiator-days fully measured / radiator-days the radiators existed, up to yesterday; the kWh, HC/HP and € count exactly those days, so today's running day is in none of them); `rest_kwh` is the meter minus the radiators, only at full coverage. `heating` is the radiators' share over the selected period's common days, never clamped (`inconsistent` above 1.02). The radiators' € come from running sums anchored on 1 January, like the meter's (the report needs the radiator-days from 1 January of the window's and the period's first year, at most 365 days more; complete radiator-days, which can no longer change, are kept in memory — `linky/radiator_cache.py`, bounded, dropped on a tariff or radiator power change and when the recorder rewrites history — so a request replays only the days since each counter last moved), so a bucket reads the same in every view and the buckets add up to the period. `by_radiator` covers the selected period, every radiator Kelvin ever recorded included; its € share the period's radiator € by largest remainder, so they add up to it to the cent. Its `temp_avg`, `setpoint_avg` and `heating_hours` cover the period's elapsed days up to the end of yesterday (the days its kWh count), and are null below 50 % sample coverage. A radiator without an energy counter is in neither `radiators` nor `by_radiator`: what it draws stays in `rest_kwh`, and it does not lower `coverage`.
  A bucket's `energy_eur` and `subscription_eur` come in whole cents from running sums anchored on 1 January (a span's cents are round(cum(to)) − round(cum(from)), split at each new year), so a day, week or month reads the same € in every window and view, and any window's buckets add up to the period to the cent; `eur` is the sum of the two lines (as on an invoice), so `energy_eur + subscription_eur = eur`; it is `null` when there is no energy line.
  Each bucket also gives `split_method` (`curve`, or the fallback used for days without a complete curve: `fallback_window` ±15 days, `fallback_month` and `fallback_all` over the complete curve days from 35 days before the day on, so a day splits the same in any window, `slots`), the `prices` rows applied (`rates` by tariff option), `retro_priced` (Linky days before the first price), `present_days`, and `curve` (complete curve days, kWh, peak and base-load watts). `hc_lens` gives, for the selected period, the share of kWh in HC next to the slots' share of the day, the mean price paid and P_hp − P_hc; `boundary_prorated` says an HC slot edge falls inside a half-hour; `quality` sums up estimates and coverage over the chart window (the bars), and `period.quality` gives the same facts over the selected period alone (by day, the window is the 7 days ending on the period's day: the hero and the Qualité facts read `period.quality`). The report reads only the Linky rows it needs (the window, the period and 400 days back; by year, the daily rows of the four previous years too).
  `comparison` pairs each elapsed day of the selected period with the same day of the previous period (`previous`), of last year (`last_year`, the same calendar dates, so by week the weekdays differ; 29 February → 28 February) and of each of the four previous periods (`avg4`, both sides measured on the paired days); only pairs with Linky data on both sides count, and above 20 % of pairs dropped there is no `change`. A selected period that is not one unit of `group` (`basis: "days"`, else `"unit"`) is compared with the runs of as many days just before it. Money compares energy € only. `projection.month` fills missing elapsed days (`filled_days`) at the trailing rate, next to what is measured (`actual_kwh`, `actual_eur`, `actual_energy_eur`), and pays the subscription from the report's first day on; with a weather place `projection.month.weather` says how the month end was predicted from the weather (`observed_days`, `today`, `forecast_days`, `normal_days`, an 80 % range `kwh_lo`/`kwh_hi`/`eur_lo`/`eur_hi`, `spread` `full` or `no_normals_spread`) and `method` is `weather`; with a `why` (`model_hidden`, `no_forecast`, `no_normals`, `weather_missing`) the month keeps the trailing-rate method (`null` without a place); `projection.year` lists 12 months; `projection.rolling` covers the next 365 days from tomorrow, day by day (`per_day_kwh`, `price_eur_kwh`, `method` `seasonal` from last year's months or `linear`). Coverage, room stats and comparisons count elapsed days only, and no Linky figure, subscription or comparison counts a day before the report's first day (the contract start, not before the daily backfill window unless Kelvin stored older days). Radiator figures come from the radiators' own meters: `radiators` and `by_radiator` count every day a radiator existed, before the first day too (`/api/energy/day` shows no intervals there).
  With a weather place (Plan 14), every summary (each bucket, `total`, `period`, `hero`) gives `outdoor` `{mean_c, min_c, max_c, dju, days, of}` over its elapsed days (`of`; `days` those with a complete weather day; `mean_c` the mean of each day's (Tmin + Tmax) / 2; `dju` the sum of DJU base 18 °C, null unless every elapsed day has weather), null without a place; `comparison.previous`/`last_year` give `weather` `{change, why, dju_cur, dju_ref, expected_cur_kwh, expected_ref_kwh, model: {baseload_kwh_day, kwh_per_dju, r2, fit_days}}` — the change at equal weather (a least-squares fit of daily Linky kWh on DJU within 45 days of the reference days, never a day of the current period; each side's kWh over what the fit expects at its own weather), or null with `why` ∈ `not_comparable`, `weather_missing`, `mild_period`, `few_days`, `few_heating_days`, `poor_fit`. With a place, the report loads Linky daily rows 46 days further back for that fit.
  Under tariff v2 each bucket also gives `tempo` (`{blue, white, red, unknown}` Tempo-priced days, null when none), `by_rate` (kWh per rate key: `base`, `hc`/`hp`, `blue_hc` … `red_hp`, `unknown_hc`/`unknown_hp`; the parts add up to the shown `kwh`), `missing_colour_days` (days whose € is unknown for want of a Tempo colour: their kWh count, their € does not, so `energy_eur`/`eur` are then the priced days' only) and `retro_scheduled`; the `radiators` block (and each `by_radiator` row) gives `hc_kwh`/`hp_kwh` only when every counted day has them (never under Base), `eur` over the priced radiator-days, and `missing_colour_days`, the days its € leave out; each `prices` row gives its `option` and all its `rates`. The report gives `option` (the price row in force today) and `tempo_lens` (the six Tempo rows in kWh and € over the priced days, adding up to the period's `energy_eur` when every day is Tempo-priced; the colour days; `unknown_kwh`, the whole kWh of the days without a colour; null without Linky data) for the selected period; under Tempo `hc_lens.delta_price` is null; `quality` gains `missing_colour_days` and `retro_scheduled_days`.
- `GET /api/energy/day?date=YYYY-MM-DD[&room=<room id>]` — one day: each interval's energy, mean power, off-peak share (`boundary` when an HC slot edge falls inside it), price and €, the radiators' Wh (and per room; `null` when a radiator that existed then has no figure, with `radiators_known` of `radiators_total`); an interval's `eur` is its measured Wh at its price, not scaled to the daily reading, so the intervals do not add up to the day's billed €; `totals` with the HC/HP of the daily reading (what is billed) next to the curve's own; `power` (peak, P10 base load, night minimum; complete days only); with `room`, its 5-min samples and the overrides active now (whatever the day). A day without a complete curve splits as the report does for that day alone. `counted_from` is the report's first counted day (the contract start, not before the daily backfill window unless Kelvin stored older days; `null` when the contract start is unknown); a day before it reads as the report does: no intervals, `totals` and `power` all `null`, `not_counted: "before_first_day"` (otherwise `null`), and `available` offers no such day. Each interval also gives `tempo_colour` (`blue` / `white` / `red`, or null when the half-hour is not Tempo-priced or its colour is unknown); `offpeak` is null under the Base option. Unknown room: `404 Pièce inconnue.`
- `GET /api/energy/weather[?from=YYYY-MM-DD&to=YYYY-MM-DD]` — « Météo et coût » (spec 2026-10-18 §8.1): the home's heating model over the 365 days before today (`window`): daily kWh against the day's outdoor mean, a change-point model `kWh = baseload + sensitivity × max(0, Tb − T)` with its balance point (`balance_point_c`, `estimated` or the 18 °C `convention`), 80 % ranges (`level`), R², fit days and exclusions (`no_energy`, `no_weather`, `away`, `outlier`), the points (each day as its day bar reads it: kWh, `energy_eur`, rate parts), the model line with its band, and the share due to the cold over the selected period (`from`/`to`, both or neither, `to` exclusive; default the current month; `422 period_invalid` otherwise, bounded like `/api/energy`). `rooms` fits each room on its fully measured radiator-days only (`coverage`), with the house's balance point. `forecast` gives the next 7 days (Météo-France, ECMWF for days 5–7): kWh and heating kWh with 80 % ranges (the assumed forecast error `sigma_c` included), € at today's prices on the day's own HC/HP or Tempo colour (`eur_why` when unknown), the week adding up to the cent. `price` is today's price mix (`null` without a tariff, then every € is `null`); `normals` says how many years of stored weather the month end uses. Without a weather place `house.why` is `weather_off` and nothing is computed. The model is memoised (at most hourly, or when the data change). `503 linky_unavailable` as `/api/energy`.
- `GET /api/energy/weather/forecast` — Maison's « Demain »: `computed_at`, `level`, `price`, the house figures without `line`, `points` and `period_share`, and `forecast` as above.
- `GET /api/linky/curve?date=YYYY-MM-DD` — 30-min curve with the off-peak share of each interval (the v1 subset; `/api/energy/day` supersedes it)
- `GET /api/settings` · `PUT /api/settings {tariff}` — tariff with price history (`valid_from`). `PUT /api/settings` takes `{"tariff": …}` in either form: the v2 document `{kva, prices: [{valid_from, option: base|hchp|tempo, subscription_eur_month, rates}], hc_schedules: [{valid_from, variants: [{months, slots}]}], tempo_hours: {hc_start, hc_end}}`, which replaces the tariff (codes `tariff_prices_missing`, `tariff_dates_duplicate`, `tariff_rates_invalid`, `hc_schedules_missing`, `hc_months_missing`, `hc_months_overlap`, `tempo_hours_invalid`, `kva_unknown`, slot codes); or the v1 body (one HC/HP row and its slots), which upserts that row (`422 tariff_form_outdated` once the tariff holds a Base or Tempo row). After a save, a Tempo tariff asks for its colours at once and SSE `grid` carries the new view. `GET /api/settings` returns the v2 view (with the v1 fields `hc_slots`, `hc_eur_kwh`, `hp_eur_kwh` kept).
- `POST /api/grid/tempo-prices` → the six published Tempo prices with `fetched_at` and `source` (one MED call a week at most; `429 med_quota`, `503 tempo_prices_unavailable`); Kelvin never saves them into the tariff.
- `GET /api/settings/linky` · `PUT /api/settings/linky {prm, token?}` — the token is write-only

Every mutating request (POST, PUT, PATCH, DELETE) must send the header `X-Kelvin: 1`, otherwise
it gets `403 {"detail": "En-tête X-Kelvin manquant.", "code": "header_missing", "params": {}}`. This blocks cross-site form posts. GET
routes and the SSE stream do not need it. Every response carries `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`. The web page also carries a `Content-Security-Policy`: scripts from Kelvin only, plus the
build's own inline scripts by SHA-256 (hashed from the served `index.html` at startup, so a rebuild
needs no change); no inline event handler (a page with one is refused at startup), nothing loaded
from or sent to another origin, no framing.

Codes for programme conflicts, sessions, alerts and lights: `program_changed_elsewhere`, `session_is_current`, `session_unknown`, `alert_unknown`, `intensity_light_off`, `intensity_range` (all in `api-codes.json`). New codes of Plan 14 (weather): `weather_location_invalid`, `weather_elevation_invalid`, `weather_search_invalid`, `weather_search_busy` (429), `weather_unavailable` (503); none has params.

Commands return `202 {"pending": …}` and resolve over SSE (`pending` and `house` events). Errors return `{"detail": "<French message>", "code": "<snake_case>", "params": {…}}` with the
HTTP status (mostly 422; 401, 403, 404, 429, 503 where they apply). `code` and `params` are the
stable contract the web app translates (`web/src/lib/i18n/api-codes.json` lists every code);
`detail` stays French for curl, logs and older clients (the API never reads `Accept-Language`). The
full list is `kelvin/errors.py`.
`DELETE /api/overrides/{id}` may return `202 {"pending": null}` when there is nothing to restore.
A pending's `label` and `error` stay French; `label_code`/`label_params` and
`error_code`/`error_params` are the codes the web translates, and `reason_code` (`quota`, `auth`,
`network`, `unknown`) says why a send failed. `GET /api/status` carries the same kind of code in
`overkiz.last_error_code`. Params hold keys and figures only, never an id, an email or a token.
A send failure's gateway text appears only, scrubbed of addresses, ids and secrets, in the French
`error` (as in `overkiz.last_error`), never in `error_params`.
An ended boost or away stays listed with `"restoring": true` until the device confirms the restore;
a restore the device does not confirm is retried after 30 s, then less and less often, at most every 30 min.

- `GET /api/setup/devices` (session): rooms (every Cozytouch place, empty ones too, `block` says why one cannot be deleted), radiators with their six sub-devices, bridge devices, each with `role`, Cozytouch `label`, `widget`, `room_id`, `misplaced`, `reachable`, `last_event_at` and raw read-only `details`; plus `sync` (`used`/`limit` full reads in 24 h, `next_possible_at`, `last_full_at`, `stale_since`, `requested`, `next_daily_at`). From memory: no Overkiz call. `appliances` lists every device that is neither a radiator's nor a bridge (water heaters, heat pumps, anything Kelvin does not drive), read-only; every device has `support`, and each radiator `kind` and `support`. Device URLs and gateway ids never appear.
- `POST /api/setup/rooms {label}`, `PATCH /api/setup/rooms/{room_id} {label}`, `DELETE /api/setup/rooms/{room_id}` (empty rooms only), `POST /api/radiators/{id}/move {room_id}`, `POST /api/setup/devices/{device_id}/tidy` (session + `X-Kelvin`): write to the Cozytouch setup and answer 202 with a pending (`kind: "setup"`, `progress`) that is confirmed only when Cozytouch reports the change. A write Cozytouch accepted but did not confirm within 60 s ends `unconfirmed` (not a refusal): its label stays reserved and the next full read reconciles it. Labels: 1–32 characters after trim, nothing invisible, unique among rooms. On an experimental server every setup write, the radiator rename included, answers `403 setup_experimental` before any request: Kelvin changes rooms and devices on the Cozytouch servers only.
- `POST /api/setup/sync` (session + `X-Kelvin`): one full setup read soon (202 `{sync}`), or 429 `setup_sync_spent` with `next_at` when no read is free (the last read of the 24 h stays for a restart).

## MCP

### Connect a client

Kelvin serves a read-only [Model Context Protocol](https://modelcontextprotocol.io) endpoint at
`/mcp`, so an AI assistant you run (Claude Code, Claude Desktop, any MCP client) can read your
rooms, programmes, temperatures, energy and cost by period, room and rate, tariff, Tempo and
EcoWatt, alerts and data freshness, answer questions about them, and propose ways to pay less.
It cannot change anything: no tool sends a command to a radiator or changes a setting; you
apply its proposals in Kelvin. Every figure comes with its unit and says whether it is measured,
computed from your tariff or estimated.

1. In Kelvin, open **Settings › Account › MCP access** and create a token. It is shown once, with the
   Claude Code and Claude Desktop settings ready to copy: copy them now.
2. Add Kelvin to your client, with Kelvin's address as your browser reaches it (LAN or VPN):

   Claude Code:
   ```bash
   claude mcp add --transport http kelvin https://kelvin.example.lan/mcp \
     --header "Authorization: Bearer kmcp_…"
   ```

   Claude Desktop (`claude_desktop_config.json`; needs Node.js for `mcp-remote`):
   ```json
   {
     "mcpServers": {
       "kelvin": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://kelvin.example.lan/mcp",
                  "--header", "Authorization:${KELVIN_MCP_AUTH}"],
         "env": { "KELVIN_MCP_AUTH": "Bearer kmcp_…" }
       }
     }
   }
   ```
3. Ask, for example: « Analyse my last month and propose savings » (the `analyse_last_month`
   prompt), « Why was October more expensive than September? », « Plan tomorrow's Tempo red day ».

Prompts take plain words as arguments, in Claude Code as `/kelvin:<prompt> <arguments>`:
`/kelvin:explain_bill september english` (a month as `2026-09`, `september`, `septembre`,
`september 2026` or `last`; a bare name means its most recent occurrence), `/kelvin:plan_tempo_red_day
demain`, `/kelvin:review_programme salon`, `/kelvin:analyse_last_month anglais`. The language is
`fr` (default) or `en` (`french`, `english`, `francais`, `anglais` also work); a room is its id or
its name; a wrong value gets a message that lists what is accepted.

Tools: `get_overview`, `get_room`, `get_programmes`, `get_temperature_history`, `get_energy`,
`get_room_energy`, `get_day_detail`, `get_tariff`, `get_grid_signals`, `get_alerts`,
`get_data_status`, `get_weather`, `get_weather_model`, `propose_savings`, `evaluate_programme`. Resources: `kelvin://house`,
`kelvin://tariff`, `kelvin://rooms/{room_id}`, `kelvin://guide`.

Security: a token reads everything in Kelvin except secrets (never the PDL, your email, a
token or a device id). It is stored hashed, limited to 60 calls a minute, and revoked at once
from the same panel (the token's “⋯” menu), which also lists the recent calls. Use HTTPS (your
reverse proxy): on plain HTTP the token crosses the network in clear. Behind a reverse proxy,
set `KELVIN_TRUSTED_PROXIES` to it, or every client looks like the proxy and ten wrong tokens from
any device lock your assistant out for 15 minutes; set `KELVIN_ALLOWED_HOSTS` to the names you
reach Kelvin by (with the refusal of any browser `Origin`, it replaces the MCP SDK's
localhost-only DNS-rebinding check). Kelvin stays off the
internet; clients that need a public URL with OAuth (claude.ai web connectors) are not
supported. `KELVIN_MCP=false` removes the endpoint.

### Protocol and tools

`POST /mcp` — Kelvin's read-only [MCP](https://modelcontextprotocol.io) server (official
Python SDK `mcp`, exact pin): Streamable HTTP, stateless, JSON responses (no `Mcp-Session-Id`, no
SSE); `GET /mcp` answers `405`. `KELVIN_MCP=false` removes the endpoint (`404`).

On by default and inert until used: a fresh install has no token, so every call answers `401`
until the owner creates one in Réglages › Compte › Accès MCP; revoking the last token makes it
inert again. It never writes to the radiators or calls Cozytouch or MyElectricalData.

Auth: only `Authorization: Bearer kmcp_…` with a live token from `POST /api/mcp/tokens`; the
session cookie is never accepted, and an MCP token is never accepted on `/api`. Answers before
the SDK, always JSON `{"error": …}` with `Cache-Control: no-store`:
- `403 origin_refused`: any request carrying an `Origin` header (no browser talks to `/mcp`);
- `429 too_many_attempts` + `Retry-After`: 10 failed authentications from one client in 15 min;
- `401 invalid_token` + `WWW-Authenticate: Bearer realm="kelvin"`: no, malformed, wrong or
  revoked token;
- `429 rate_limited` + `Retry-After`: more than 60 calls a minute or 1 000 an hour for a token;
- `413` from the SDK above 64 KiB of body.

The SDK's DNS-rebinding check is off (it only knows localhost); `KELVIN_ALLOWED_HOSTS` and the
`Origin` refusal replace it. Two tool calls run at a time (a third waits).

Tools (all annotated `read_only_hint`, never `destructive`, never `open_world`):

| Tool | Arguments | Data |
|---|---|---|
| `get_overview` | — | Rooms (temperature, mode, setpoints, heating now, window, presence), boosts and aways in progress, active alert count and severity, today's Tempo and EcoWatt, the option in force |
| `get_room` | `room_id` | Each radiator's state, setpoints, power and capabilities (as data); 24 h heating share and coverage; today's window-open and presence runs; `meter_total_kwh` is a lifetime counter as last reported (never a consumption by difference) |
| `get_programmes` | `room_id?` | Weekly programmes per radiator, locked days, comfort/eco, this week's off-peak hours per day, the share of comfort minutes in peak hours (`billing/overlap.py`) |
| `get_temperature_history` | `start`, `end` (local ISO), `room_id` or `radiator_ids`, `step_minutes` 5–1440 | Mean temperature, effective setpoint and target per step; `/api/history` bounds, at most 2 000 points per radiator and 20 000 per call |
| `get_energy` | `start`, `end` (dates, end exclusive), `group` | The report of `GET /api/energy` with neutral keys: totals, buckets (at most 93), by rate, by room (the sum of its radiators' `by_radiator` cents), by radiator, comparisons, projection, lenses, quality; with a weather place, each bucket and the totals carry `outdoor` (`mean_c`, `min_c`, `max_c`, `heating_degree_days`, `days_with_weather`, `elapsed_days`) and the `previous`/`last_year` comparisons `weather_normalised` (the change at equal weather, its `why` and model) |
| `get_room_energy` | `room_id`, `days` 1–31 | `GET /api/rooms/{id}/energy` |
| `get_day_detail` | `date` | `GET /api/energy/day` without `room` |
| `get_tariff` | — | The tariff view (neutral keys), the option today, the last contract read (kVA, off-peak hours); never the PDL |
| `get_grid_signals` | `start?`, `end?` (≤ 366 days) | Stored Tempo colours (only with a Tempo row) and counts, EcoWatt days, today/tomorrow; never a fetch |
| `get_weather_model` | `start`, `end` (dates, end exclusive, both or neither: the period of `period_share_due_to_cold`), `include_days` | « Météo et coût » (`GET /api/energy/weather`) with neutral keys: baseload, kWh and € per degree colder with 80 % ranges, balance point, fit days and exclusions, each room's sensitivity (`room_name`, `coverage_share`), the next 7 days (kWh, heating kWh, € with ranges, `eur_missing_reason`, model), `location_set`; with `include_days` the daily points; basis `estimated` (`unknown` when nothing is computed); never a fetch, never the place |
| `get_weather` | `start`, `end` (dates, end exclusive), `granularity` (`daily` ≤ 4 × 366 days, `hourly` ≤ 31) | Stored outdoor weather: daily mean, min, max, heating degree days (base 18 °C), hours, completeness and model, or hourly temperature, feels-like, humidity, model and `forecast`; `location_set` (never the place, its coordinates or altitude); basis `published`; never a fetch |
| `get_alerts` | `state` (`active`/`all`) | `AlertStore.listing` |
| `get_data_status` | — | Kelvin's mode, Cozytouch connection, Linky state and MED calls (no `prm`), grid sources, `weather` (`location_set`, `mode`, the forecast job's `state`, `last_ok_at`, `next_at`, `weighted_calls_today`), each radiator meter's first and last reading |
| `propose_savings` | `days` 7–31 | Proposals (`shift_to_offpeak`, `tempo_red_days`, `tempo_peak_share`, `review_programme`, `review_setpoints` for rooms in manual mode, `data_gaps`) over `[from_date, to_date_exclusive)`, the last `days` elapsed days (every room figure from the report's `by_radiator` for that window, today never in it): measured figures, an upper-bound estimate only at equal consumption, `apply_in_app`; nothing is applied |
| `evaluate_programme` | `room_id`, `week` | A draft week checked against Kelvin's programme rules (`not_on_step` with `step_minutes`: the room's step, the coarsest of its radiators; `end_after_last` with `last`) and locked days, the peak share before and after, the room's measured peak kWh over the last 30 elapsed days (`measured`, from the report's `by_radiator`), a labelled estimate; nothing is sent or stored |

Resources: `kelvin://house` (the `get_overview` envelope), `kelvin://tariff`,
`kelvin://rooms/{room_id}` (the `get_room` envelope), `kelvin://guide` (Markdown: how to read
the data). Prompts (`language` `fr`/`en`, default `fr`): `analyse_last_month`, `explain_bill`
(`month`), `plan_tempo_red_day` (`date?`), `review_programme` (`room_id`).

Every tool and resource returns `{data, meta}`; `meta` holds `tool`, `generated_at` (local ISO),
`timezone`, `simulator`, `sources`, `basis` (`measured`, `computed`, `estimated`, `mixed`,
`static`, `published` (weather model data), `unknown`), `notes` and `units` (the unit of each field suffix). `hc`/`hp` keys read
`offpeak`/`peak`. A redaction backstop drops secret keys and refuses device URLs, emails and
PDL-like strings. Tool errors are `is_error` results whose text starts with a stable code:
`kelvin_not_running`, `room_unknown`, `radiator_unknown`, `too_many_radiators`, `period_invalid`,
`linky_unavailable`, `invalid_argument`, `internal_error` (never a traceback).

Audit: every tool, resource and prompt call is a row in `mcp_audit` (time, token id, kind, name,
sanitised arguments without secrets, outcome, error code, duration); refusals are aggregated,
never dropped: one row per (token, or unknown token) × reason × minute, whose `args` hold `count`,
`first_seen_at`, `last_seen_at` and `sources` (distinct clients), updated as refusals arrive and
flushed when the window closes, before a listing and at shutdown (`GET /api/mcp/audit` rows carry
`count`). Rows are kept 90 days; above 20 000 the heaviest source
(a token, or the refusals) loses its oldest rows first and no source goes below its newest 200,
so one token flooding at its limit never evicts another's recent calls. `GET /api/mcp/audit`
lists them. SDK-side refusals (an unknown tool, invalid arguments) are not audited.

## Linky (MyElectricalData)

### Connect Linky

1. Create a MyElectricalData account and give it access to your meter's data (Enedis consent).
   It gives you a token; your PDL is the 14-digit number on your contract or meter.
2. In Kelvin, open **Settings › Linky** (**Réglages › Linky** in French) and enter the PDL and the
   token (the PDL stays masked on that page until you press « Afficher »). Then **Settings › Tariff**
   shows the tariff in force; « Nouveau prix… » adds one from a date (the option, Base, HC/HP or
   Tempo, the prices, and for HC/HP the off-peak hours, which may differ by season) and « Corriger
   le tarif en vigueur » fixes the row in force. Existing HC/HP settings are carried over as they are.
3. Kelvin syncs at 08:00 and 14:00 (Europe/Paris), backfills a year of daily data and 30 days
   of 30-minute curve, and never spends more than 10 of MyElectricalData's 50 daily calls
   (4 a day at most for the grid signals; the simulator allows 14). Every MyElectricalData call
   counts in that budget, including the public Tempo and EcoWatt ones and a contract re-read once
   a month that tells you when Enedis moves your off-peak hours; Kelvin never changes your tariff
   by itself.
4. Tempo colours are fetched only while a Tempo price row is in force (at 06:30 if today's colour
   is missing, at 11:15 and 13:15 while tomorrow's is); EcoWatt is shown to
   everyone. A Tempo colour, once stored, never changes (a correction by MyElectricalData is
   logged, not applied: it prices the history). If you switch to Tempo on a day whose
   MyElectricalData budget is already spent, the colours arrive the next day and the days in
   between read « couleur inconnue » (their kWh count, their € stays blank).

### Sync and budget

Enter the PDL and the MyElectricalData token in Réglages › Linky (or set `MED_PRM`/`MED_TOKEN`). Kelvin
syncs at 08:00 and 14:00 (Europe/Paris), backfills a year of daily data and 30 days of 30-min
curve, then extends the curve back to the contract start (at most 24 months) with spare calls,
and never spends more than 10 calls a day (MyElectricalData allows 50), the PDL/token checks
included. The simulator uses a synthetic Linky and a demo tariff. Verified behaviour:
[`docs/linky-notes.md`](../docs/linky-notes.md).

MyElectricalData calls share one ledger: at most 10 a Paris day (`calls_today` / `budget` in
`GET /api/settings/linky`), every endpoint included — Linky, the monthly contract re-read and
the public Tempo/EcoWatt endpoints (`grid_calls_today`, at most 4). Older curve chunks wait while
grid calls are still planned for the day. The contract is re-read once a month (normally the 1st
at 08:00) to notice new off-peak hours; it never changes the tariff by itself. The grid's calls
are EcoWatt at 07:15 and 17:15 and, only while a Tempo row is in force or ahead, Tempo at 06:30
if today's colour is missing and at 11:15 and 13:15 while tomorrow's is; the Tempo history rides
in those calls, and a history day MyElectricalData never returns costs no call of its own (a
missing history day calls by itself only when it lies before the last range asked, i.e. after an
older Tempo row is added). The simulator adds 4 spare calls (14) so a same-day Tempo switch can be
coloured. A real install that has spent its day colours that switch the next day.

## Weather (Open-Meteo)

Off by default: Réglages › Météo sets the place (a town found through Open-Meteo's geocoding, or
typed coordinates and altitude), stored rounded to 0.01° and sent only to Open-Meteo. In
metropolitan France Kelvin asks Météo-France's AROME France HD (~1.5 km) through Open-Meteo, hour
by hour, falling back to `meteofrance_seamless` (ARPEGE) where AROME HD has no value; history comes
from the historical forecast archive (AROME HD, from 2022-11-13) and ERA5-Land (before that, and
for AROME HD gaps older than 6 days). Elsewhere Open-Meteo's best model answers both. A forecast
job runs every hour at :17 (the last 2 days and the next 2) and a backfill job at 04:50 (and right
after a save) from the first Linky day or radiator reading (5 years at most) to yesterday. Kelvin
caps itself at 400 weighted calls a Paris day (Open-Meteo counts more than 10 variables or 2 weeks
as several calls), 300 per backfill run, and 30 searches an hour, 200 a day. Hourly rows are kept
400 days, daily rows 5 years; degree days (DJU, base 18 °C) follow Météo-France's « méthode
météo » on the Paris civil day. Data: Open-Meteo.com (CC BY 4.0), Météo-France, Copernicus
(ERA5-Land), GeoNames; Kelvin uses the free API, for non-commercial use. Verified behaviour:
[`docs/weather-notes.md`](../docs/weather-notes.md).

## Data

`KELVIN_DATA` holds `account.json` (0600) and `kelvin.db`: samples (kept 400 days), radiator
meter readings (kept), Linky data, tariffs, sessions, overrides and the command log (90 days). `tempo_days` holds one colour per Tempo day, kept (it prices the history; a stored colour never changes, a correction by MED is logged); `ecowatt_days` is kept 30 days; the settings `tariff` (v2), `tariff_v1` (the pre-migration copy), `contract_last`, `tempo_price_prefill` and `scheduler` hold the rest. The schema version is the `schema_version` setting; migrations run at startup in batches and are idempotent. v1 stores an absent meter register as `NULL` and keeps the readings as they were in `energy_v0`. v2 gives `sessions` an opaque `id` (never derived from the token or its hash). The `alerts` table (kept 90 days after resolution) and the `tempo_days`/`ecowatt_days` tables are part of the base schema (`CREATE TABLE IF NOT EXISTS`, no migration). v3 adds the label and error codes to `command_log` (`label_code`, `label_params`, `error_code`, `error_params`, `reason_code`), which the `command_failed` alert reads. v4 adds `mcp_tokens` (only each secret's SHA-256, revoked tokens kept 90 days) and `mcp_audit` (90 days; 20 000 rows, pruned fairly per source). v5 (Plan 14) adds `weather_hourly` (400 days) and `weather_daily` (5 years); the settings `weather_location` (the place: never logged, never in an error, never in MCP), `weather_calls` (the day's weighted ledger), `weather_backfill` (ranges asked) and `weather_demo_seeded` (simulator).

Meter readings are written when a counter changes, at the time Kelvin learns it (Overkiz reports counters only on change); energy between two readings is spread over the time between them, by the radiator's working rate when the 5-min samples cover the gap (and the weighted power stays within the radiator's), by time otherwise. A drop to below half the counter is a reset only if the next different reading stays low; a jump above the radiator's power (+10 %, +1 min; 5 kW when the power is unknown, for plausibility only) is skipped, and becomes the new reference (never consumption) only when the counter then moves on from it plausibly (a replaced meter, a glitched reference); while such a jump is pending, a later reading at or above it is judged against the jump however late it comes, so a long flat gap never turns the jump into consumption. Until a span is accepted from it, a reference is unconfirmed: a lower level that persists (the next reading moves on from it plausibly) replaces it, so a glitch too high cannot stall counting. An increase above 3 h of full power (plausible only over a long gap) waits for the next reading: counted when that reading moves on from it plausibly, dropped as a glitch otherwise, so a glitch after a quiet stretch never lands in the idle days (the latest such reading stays unknown until then). Readings are cleaned in fixed 28-day chunks, each replaying from 3 days before it, anchored at the first reading of the value the counter held then (and the change before it), so a bucket reads the same in any window and repeated legacy rows are counted once.

## Notes

- Commands are confirmed by device state, not by Overkiz execution status (see [`docs/overkiz-notes.md`](../docs/overkiz-notes.md)). Every Overkiz call times out after 30 s. A programme is compared by meaning (days in any order, slots sorted, empty `00:00–00:00` markers ignored, `HH:MM:SS` read as `HH:MM`). Before a command fails (90 s without its states, 10 s after a `COMPLETED` execution whose states do not match, 15 s after a `FAILED` one), Kelvin reads each unconfirmed device's states once (`GET /setup/devices/{url}/states`; never a full setup read or `states/refresh`) and judges from that. A programme the radiators changed to other times fails as soon as its execution is reported with `program_differs` (`params.days`, and `day`, `sent`, `kept`: the first time that differs, e.g. 17:45 sent, 17:00 kept); a failure (`no_confirmation`, `program_differs`, `radiator_refused`, `radiator_offline`) whose states arrive within 5 minutes, before a newer command takes the same states, turns `confirmed`. A command is judged radiator by radiator: one whose only missing states are on radiators reported `unavailable` (`core:StatusState`) is `confirmed` for the others, with those radiators in the pending's `offline` (« Confirmé · 1 hors ligne »); it fails with `radiator_offline` (« Hors ligne : la consigne n’a pas pu être transmise. ») only when every radiator it was for is offline. An away or boost restore keeps its offline radiators and retries them. Logs name the command's label, how it settled (event or read) and how long it took.
- Kelvin reads the whole Cozytouch setup (`GET /setup/places`, `/setup/devices`, documented as one call a day) only at startup, after an outage and when the password changes, at most 3 times in any 24 h. One budget covers startup, background retries, logins and the poller, and its times are stored in the `overkiz_setup_reads` setting, so a restart cannot reset it (the simulator, which never calls Overkiz, keeps it in memory only). The poller resyncs after an outage with a full read only while two are left, otherwise device by device, so the last read stays for a restart. A start is never held up by the budget: when it is spent, Kelvin builds the house from the stored structure of the last full read (the `overkiz_setup` setting: places and devices, no states) and reads every device's states one by one; with nothing stored it reads the setup anyway, once per 24 h at most, and logs a warning. Every full read also refreshes rooms, device labels and placement. Besides startup and outages, Kelvin spends one for: a daily refresh at 04:30 (skipped after a recent read), the check after its own room and device changes, a room change made in the Cozytouch app, and « Synchroniser » (`POST /api/setup/sync`); none of them ever takes the last read of the 24 h, which stays for a restart. Device moves and renames made in the app arrive as events and cost nothing. Between those reads Kelvin follows events and re-reads one radiator's device states every 10 minutes. A device whose state read fails is skipped and retried less and less often, at most every 6 h; it never holds up the events.
- Boost and away are managed by Kelvin and stored in SQLite; they survive restarts.
- Scripts in `scripts/` talk to a live installation and write only to `captures/` (gitignored): `capture_fixture.py` is read-only, `med_capture.py` reads MyElectricalData, `overkiz_try.py` executes commands. `places_try.py` reads the shape of the place tree (counts and types only); with `--write --i-am-watching` it runs the temporary « Kelvin test » check (create, rename, delete a place; the owner watching, Kelvin stopped), the only script that writes to the Cozytouch setup. `sauter_golden.py` is the exception: simulator only; it recorded `tests/fixtures/sauter_commands.json` before the multi-brand command layer existed (re-recorded only in justified commits that state why). Do not re-run it to make a change pass.
