# Kelvin

Self-hosted control of electric heating through the Overkiz cloud: Sauter, Atlantic and Thermor
homes on Cozytouch (tested on real Sauter radiators), and, experimentally, homes on other Overkiz
servers. Kelvin is a
fast, clear web app in French and English for phone and desktop: rooms, schedules, boost and away, a
temperature history, and an electricity-bill estimate from your Linky meter.

Kelvin is an independent project, not affiliated with or endorsed by the makers of the
devices and services it works with (see [the note at the end](#not-affiliated)).

## Features

- **Rooms first.** Overkiz places become rooms; a room with two radiators acts as one, and
  the detail shows each radiator.
- **Truthful commands.** A change counts as done only when the radiator reports the new state.
  Pending, confirmed and failed are shown as such, including Overkiz's misleading
  `OVERRIDEMODE_ERROR` on commands that did apply.
- **Settings overview:** Réglages (Settings, `/home`) shows what is happening now (away, boosts) with its
  actions, the alerts when there are some, and one card per section (Rooms and devices, Tariff, Linky, Data
  sources, Account) that summarises it and opens its own page; language and technical details are set in
  place (one dark theme).
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
- **Rooms at a glance:** one line of state per room (« Programme · Confort jusqu’à 23:00 », « Chauffe
  temporaire · 22 °C jusqu’à 21:45 », « Hors ligne depuis 14:32 »), the reading and its target in
  words, and today's curve; rooms whose radiators are switched off move to the end, calm and
  without a stale temperature. A room opens its panel: state, controls, boost written as a sentence
  (« Chauffer à 22 °C pendant 2 h », and what happens after), today's chart with a legend, energy
  and each radiator.
- **Control:** off, manual, schedule; setpoint; the weekly schedule (the radiators' own three
  comfort periods a day): the week as a read-only picture with the times written out, the comfort
  and eco temperatures and what happens next, and one day edited at a time (drag or type the
  periods, « Copier vers… » weekdays, the weekend or every day; nothing is sent before « Envoyer »;
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
- **Grid signals:** a one-line strip on Rooms and Energy. With a Tempo price row in force,
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
- **AI assistants can read your data through MCP, read-only** (see below).

## AI assistants (MCP)

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
`get_data_status`, `propose_savings`, `evaluate_programme`. Resources: `kelvin://house`,
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

## Screens

| Screen | Path | What it answers |
|---|---|---|
| Maison / Home | `/` | The « Tableau » dashboard: summary chips (climate, the month's €, grid signals, away), alerts, each room with its reading, state and −/+ for the setpoint in force, the month, the tariff right now, tomorrow and yesterday, today's schedule; offline rooms calm and last |
| Room | `/rooms/<id>` | The room sheet over the dashboard: the large setpoint with −/+ and a slider, the modes, Chauffe temporaire, today's chart and energy, the schedule's temperatures, each radiator, this month's kWh and € |
| Programme / Schedule | `/schedule` | The week as a picture and one day edited at a time; nothing is sent before « Envoyer » |
| Énergie / Energy | `/energy` | A board: the period's cost and kWh beside the bars (the half-hour curve first in Day and Week), the off-peak split or the Tempo days, where the energy goes, then the full sections, analysis and data quality |
| Réglages / Settings | `/home` | What is happening now, alerts, one card per section, display preferences |
| Pièces et appareils | `/home/devices` | Rooms, radiators and box devices as Cozytouch holds them, with their actions and the sync line |
| Tarif / Tariff | `/home/tariff` | The tariff in force as a summary, « Nouveau prix… », the price history |
| Linky | `/home/linky` | The connection, the MyElectricalData calls, « Modifier la connexion » |
| Sources de données | `/home/sources` | When Cozytouch, Linky, RTE EcoWatt (and Tempo) were last read |
| Compte / Account | `/home/account` | The home's account, its server, signed-in devices |
| Connexion / Sign in | `/login` | The home's Cozytouch account, the server in one line |

`cd web && SCREENS=1 SCREENS_DIR=../docs/screenshots npx playwright test screens.spec.ts` renders them
from the simulator (`SCREENS_LOCALE=fr|en`).

## Compatibility

Kelvin talks to the Overkiz cloud through [pyoverkiz](https://github.com/iMicknl/python-overkiz-api).
It has been tested on real hardware with Sauter radiators on the Sauter Cozytouch server only.
Everything else follows pyoverkiz's device definitions and Home Assistant's Overkiz mapping and has
**not** been tried on a real device (see the « UNVERIFIED » section of
[docs/overkiz-notes.md](docs/overkiz-notes.md)).

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

## Security model — read this before installing

- **Login is your home's account on its Overkiz server** (Sauter Cozytouch by default; choose
  another at the first login). Kelvin has no users of its own: it checks the email and password
  against that server. The first login on a fresh install decides which
  account the install belongs to. Anyone who can log in to Cozytouch with that account can log
  in to Kelvin. Logins are throttled per client (5 failures per 15 min) and overall.
- **Sessions:** every signed-in browser is listed in Settings › Account › Signed-in devices (browser
  and system only; the raw user agent and the session token never leave the server). Signing a
  device out takes effect on its next request and closes its live stream within 30 seconds.
- **Kelvin stores that password** in `/data/account.json` (mode 0600), because it must
  re-login to Cozytouch unattended. Protect and back up the data volume like a password store.
- **Keep it on your LAN or a VPN** such as Tailscale or WireGuard. Kelvin serves plain HTTP.
  **Never expose it directly to the internet** or forward a router port to it.
- **Reverse proxy:** `X-Forwarded-*` headers are ignored by default. Only behind a reverse
  proxy you control, set `KELVIN_TRUSTED_PROXIES` to that proxy's exact address. `*` and
  wildcard-sized networks are refused: they would let any client fake its IP (dodging the login
  throttle) and HTTPS.
- **Host allowlist (recommended):** set `KELVIN_ALLOWED_HOSTS` in `.env` to the host names and
  addresses you use to reach Kelvin (for example `kelvin.lan,192.168.1.10`), before the first
  login. Kelvin then refuses requests for any other host name. This blocks DNS rebinding, where
  a hostile web page you visit reaches Kelvin through your browser (to try logins or, on a
  fresh install, to claim it). `localhost` and `127.0.0.1` always pass.
- **What leaves your home for grid signals:** Kelvin asks MyElectricalData's public Tempo and
  EcoWatt endpoints for dates only: no token, no PDL, nothing about your consumption. There is no
  other grid source.
- The image runs as uid 10001; the example compose file adds a read-only root filesystem, no
  capabilities and `no-new-privileges`.
- Report vulnerabilities privately: see [SECURITY.md](SECURITY.md).

## Quick start (Docker Compose)

You need Docker with Compose v2 on an amd64 or arm64 host, and a Cozytouch account with Sauter
radiators.

    git clone https://github.com/lborruto/kelvin.git
    cd kelvin
    cp .env.example .env        # then set KELVIN_ALLOWED_HOSTS; every other value may stay empty
    docker compose up -d --build
    docker compose ps           # wait for "healthy"

The compose file builds the image from this repository (`build: .`). Open
`http://<your-server>:8070`. Once a release is published, you can pull the image instead of
building it: in `docker-compose.yml`, replace `build: .` with the commented
`image: ghcr.io/lborruto/kelvin:latest` line.

### First login

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

### Connect Linky (optional)

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

### Try the simulator

    docker build -t kelvin .
    docker run --rm -p 8070:8080 -e KELVIN_FAKE=1 kelvin

Open http://localhost:8070 and log in with `demo@kelvin.local` / `kelvin`. Nothing talks to
Cozytouch or Linky. Do not reuse a simulator's data volume for your home: Kelvin refuses to
connect a Cozytouch account to a data directory that holds simulator data.

### Upgrade, back up and restore

    git pull && docker compose up -d --build

The data volume holds your Cozytouch password and Linky token: treat a backup like a password
store. This writes it to your home directory, outside the checkout (so `git add` can never pick
it up), readable only by you:

    backup="kelvin-backup-$(date +%F).tgz"
    docker compose stop
    docker run --rm -v kelvin_data:/data:ro -v "$HOME":/backup busybox:1.37 \
      sh -c "umask 077 && tar czf /backup/$backup -C /data . && chown $(id -u):$(id -g) /backup/$backup"
    docker compose start

With rootless Docker, drop the `&& chown …` part: the container's root already maps to your
user, and the chown would hand the file to a sub-uid you cannot read.

To restore, set `backup` to the archive's name in your home directory, then stop Kelvin,
replace the volume's content and give it back to Kelvin's user (uid 10001). On a new host, run
`docker compose create` first so the volume exists.

    backup="kelvin-backup-2026-10-14.tgz"
    docker compose stop
    docker run --rm -v kelvin_data:/data -v "$HOME":/backup:ro busybox:1.37 \
      sh -c "rm -rf /data/* /data/.[!.]* && tar xzf /backup/$backup -C /data && chown -R 10001:10001 /data && chmod 700 /data"
    docker compose start

## Configuration

All settings are environment variables, and every one is optional. `.env.example` lists them.
The compose file passes `TZ` and `KELVIN_ALLOWED_HOSTS` from `.env`; add any other one to
`environment:` in `docker-compose.yml`. No password or token belongs in the compose file or in
`.env`: you log in with the Cozytouch account in the browser and connect Linky in Settings › Linky, and
Kelvin keeps both in `account.json` (0600) in its data volume.

| Variable | Default in the image | Meaning |
|---|---|---|
| `TZ` | `Europe/Paris` | Time zone for schedules, energy days and the Linky sync |
| `COZY_SERVER` | `sauter_cozytouch` | The home's Overkiz server (`atlantic_cozytouch`, `thermor_cozytouch`, or an experimental server id); read only when `COZY_USER`/`COZY_PASS` create the account file |
| `COZY_USER`, `COZY_PASS` | — | Advanced, unattended setup only: create the account file on the first start instead of the first login (Compose interpolates `$`: write it as `$$`) |
| `MED_PRM`, `MED_TOKEN` | — | Advanced: fallback Linky PDL and token; Settings › Linky wins |
| `KELVIN_DATA` | `/data` | SQLite database and `account.json` |
| `KELVIN_WEB` | `/app/web` | The built web app served next to the API |
| `KELVIN_HOST`, `KELVIN_PORT` | `0.0.0.0`, `8080` | Bind address (outside Docker: `127.0.0.1`, `8000`) |
| `KELVIN_ALLOWED_HOSTS` | — | Comma-separated Host allowlist; `localhost` always passes |
| `KELVIN_TRUSTED_PROXIES` | — | **Only behind a trusted reverse proxy:** its exact addresses |
| `KELVIN_MCP` | `true` | `false` removes the read-only MCP endpoint at `/mcp` (see [AI assistants](#ai-assistants-mcp)) |
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

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `KELVIN_FAKE=1` runs everything against the
simulator, and every test uses it.

## Project status

Early (0.x). Kelvin is developed against one installation: Sauter IPALA H and HEKLA radiators
on io-homecontrol, with a Cozytouch bridge. Multi-brand (Plan 12): servers and device kinds beyond
Sauter are « expected to work » or « experimental » and untested on real hardware (see
[Compatibility](#compatibility)); messages that name Cozytouch keep that word on every server. The
UI is in French and English (French by default; switch in Settings › Display, or on the sign-in
screen). The Linky bill estimate supports the Base, HC/HP and Tempo options; Tempo and EcoWatt
are shown on Rooms and Energy and raise alerts. AI assistants can read Kelvin's data through a
read-only MCP endpoint (Plan 13), with its tokens in Settings › Account.

## Licence

MIT, see [LICENSE](LICENSE). Bundled fonts (Geist, JetBrains Mono) are under the SIL Open Font
License 1.1; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Not affiliated

Kelvin is an independent, unofficial project. It is not made, endorsed or supported by
Atlantic, Sauter, Cozytouch, Overkiz, Enedis or MyElectricalData. Atlantic, Sauter, Cozytouch,
Overkiz, Enedis, Linky and MyElectricalData are trademarks of their respective owners; they are
named here only to say what Kelvin works with.
