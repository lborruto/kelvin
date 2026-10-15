# Kelvin web

SvelteKit (Svelte 5) PWA, built as a static SPA and served by the backend in production.

## Develop

    # terminal 1 — the backend in simulator mode
    cd backend && KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-dev uv run uvicorn --factory kelvin.api.app:create_app --port 8000
    # terminal 2 — the UI with hot reload, proxying /api to :8000 (override with KELVIN_API)
    cd web && npm ci && npm run dev

Kelvin asks for a login. In simulator mode (`KELVIN_FAKE=1`) the account is
`demo@kelvin.local` / `kelvin`; the first login on a fresh `KELVIN_DATA` makes it the home's account.

## Check

    npm run check        # svelte-check
    npx vitest run       # unit and component tests
    npx playwright test  # end-to-end against the simulator (builds, then starts the backend serving the build)

The end-to-end suite runs a phone (Pixel 7) and a desktop project in Chromium, on port 4174 with
its data in `/tmp/kelvin-e2e`, through `python -m kelvin` like the Docker image. If Playwright
asks for a browser: `npx playwright install chromium`. A `setup` project logs in through the
login screen first and shares the session (`e2e/.auth/state.json`, gitignored) with the others.

Screenshots (simulator only): `SCREENS=1 npx playwright test screens` writes them to
`test-results/screens/`; set `SCREENS_DIR` to write elsewhere.

## Serve the build from the backend

    npm run build
    cd ../backend && KELVIN_FAKE=1 KELVIN_DATA=/tmp/kelvin-dev KELVIN_WEB=../web/build uv run python -m kelvin

Then open http://127.0.0.1:8000. Against your own home, drop `KELVIN_FAKE=1` and use a real
data directory (`KELVIN_DATA=./data`).

The version shown on Maison comes from `package.json`. Icons are rendered from
`static/icon.svg` by `npm run icons`.

## Énergie CSV export (machine contract)

Énergie › Exporter builds the files in the browser from the JSON the page shows (no server
endpoint), so every figure is the one the page shows for the same bar or half-hour, at the API's
precision: a day's € are the same in whatever period it is exported. Every file is UTF-8 with a
BOM, `;`-separated, CRLF line ends, `,` as the decimal separator with no thousands separator (the
French spreadsheet convention, so a French Excel or LibreOffice opens it with numbers as numbers;
Plan 7 makes the CSV follow the UI locale), timestamps in ISO 8601 Paris
local time with their offset (`2026-10-25T02:30:00+01:00`, so the repeated autumn hour stays
unambiguous), and an empty cell for a missing value (never 0). Headers stay French in every
locale. Text cells that start with `=`, `+`, `-`, `@`, a tab or a CR are prefixed with `'`. No
PDL, token, email or id is exported; rooms and radiators appear by name.

- `energie_<from>_<to>_<group>.csv` (`<to>` exclusive) — one row per bar of the selected period
  (with Linky, the buckets before the first one with Linky data are not bars, and not rows), then a
  `total` row (the hero's figures):
  `periode;debut;fin;maison_kwh;hc_kwh;hp_kwh;split_estime;radiateurs_kwh;radiateurs_interp;reste_kwh;energie_eur;abonnement_eur;total_eur;prix;jours_manquants;radiateurs_jusqu_au;radiateurs_couverture`.
  kWh have 3 decimals, € 2; `split_estime` and `radiateurs_interp` are `1`/`0` (radiator energy
  spread between two readings counts as estimated); `prix` is `hc=0,2068|hp=0,2700`, or, when a bar
  used several price rows, each prefixed with its date and separated by a space.
  The radiator figures count elapsed days only: `radiateurs_jusqu_au` (`YYYY-MM-DD`, empty without a
  radiator sum) is the last day they count, the row's last day for a past row, yesterday for a row
  running into today (`debut`/`fin` stay the row's whole span, so a running month's total reads
  `fin` = the next 1st and `radiateurs_jusqu_au` = yesterday). `radiateurs_couverture` (last; both
  columns were added after the spec's first header, so readers by name keep working) is the share of
  the radiator-days up to `radiateurs_jusqu_au` that were fully measured, a 4-decimal fraction: below
  `1,0000` a radiator was not measured every one of those days. A radiator sum is whole for the row
  only when `radiateurs_couverture` is `1,0000` and `radiateurs_jusqu_au` is the row's last day.
  `reste_kwh` is given only when the radiators cover the whole bar.
  A counted day without Linky data keeps its `abonnement_eur`, with `total_eur` empty.
- `courbe_<date>.csv` — one row per interval of the Courbe's day (46, 48 or 50):
  `debut;fin;minutes;wh;w_moyen;part_hc;couleur_tempo;prix;eur;radiateurs_wh`. Wh and W are integers,
  `part_hc` a 4-decimal fraction, `prix` €/kWh and `eur` with 4 decimals; `couleur_tempo` is empty
  until the Tempo option exists. `radiateurs_wh` is empty unless every radiator was measured in
  that half-hour (never a partial sum).
- `pieces_<from>_<to>.csv` — the period's elapsed days (up to yesterday), as Par pièce shows them;
  each room, then its radiators:
  `piece;radiateur;kwh;part;hc_kwh;hp_kwh;eur;temp_moy;consigne_moy;heures_chauffe;couverture;depuis`.
  `part` (rooms) and `couverture` (radiators) are 4-decimal fractions; `eur` is energy only; kWh, HC
  and HP are the API's 3-decimal figures (the table at 2 decimals allocates its rounding so rows add up). A
  room's kWh sums its radiators with a figure: its radiators' `couverture` says whether it is whole.
