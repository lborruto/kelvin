# Third-party notices

Kelvin is MIT-licensed (see `LICENSE`). The Docker image and the built web app also contain
the third-party works below. Their licence texts ship in the image under
`/usr/share/licenses/kelvin/` (fonts) and inside each Python package's `*.dist-info` directory.

## Fonts (bundled in the web app)

| Font | Copyright | Licence | Source |
|---|---|---|---|
| Geist (variable) | Copyright 2024 The Geist Project Authors | SIL Open Font License 1.1 | https://github.com/vercel/geist-font, via `@fontsource-variable/geist` |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors | SIL Open Font License 1.1 | https://github.com/JetBrains/JetBrainsMono, via `@fontsource/jetbrains-mono` |

The web app imports them from the Fontsource npm packages (`web/src/app.css`): Geist as a
variable font, JetBrains Mono at weight 400 only. Vite copies Fontsource's per-script subset
files (WOFF2, plus WOFF fallbacks for JetBrains Mono) into the build unmodified. The licence
files from both packages ship in the image under `/usr/share/licenses/kelvin/fonts/`. The
full licence text: https://openfontlicense.org/open-font-license-official-text/

## Data (outdoor weather, only when the owner sets a place)

| Source | Licence and terms |
|---|---|
| [Open-Meteo](https://open-meteo.com/) API data | CC BY 4.0 (https://open-meteo.com/en/license); the free API is for non-commercial use (https://open-meteo.com/en/terms). Kelvin shows « Weather data by Open-Meteo.com » with a link next to every weather figure. |
| Météo-France (AROME France HD, ARPEGE model data, through Open-Meteo) | Météo-France open-data licence, https://donneespubliques.meteofrance.fr |
| Copernicus Climate Change Service (ERA5-Land, through Open-Meteo) | Contains modified Copernicus Climate Change Service information; Copernicus licence, https://cds.climate.copernicus.eu |
| GeoNames (place search, through Open-Meteo's geocoder) | CC BY 4.0, https://www.geonames.org |

## Runtime dependencies (summary)

Backend (Python): FastAPI (MIT), Starlette (BSD-3-Clause), uvicorn (BSD-3-Clause),
pyoverkiz (MIT), aiohttp (Apache-2.0 and MIT), pydantic and pydantic-settings (MIT),
sse-starlette (BSD-3-Clause), httpx (BSD-3-Clause), certifi (MPL-2.0, unmodified); the MCP
SDK mcp and mcp-types (MIT) and what they bring: httpx2 and httpcore2 (BSD-3-Clause), PyJWT
(MIT), cryptography (Apache-2.0 OR BSD-3-Clause), cffi (MIT-0), pycparser (BSD-3-Clause),
opentelemetry-api (Apache-2.0), jsonschema, jsonschema-specifications, referencing and rpds-py
(MIT), python-multipart (Apache-2.0), truststore (MIT); and their transitive dependencies.

Web: the Svelte and SvelteKit runtime compiled into the app (MIT); d3-scale and d3-shape and
their dependencies d3-array, d3-color, d3-format, d3-interpolate, d3-path, d3-time,
d3-time-format and internmap (ISC); Workbox (MIT, in the service worker).

Image: Python 3.13 (Python Software Foundation License) and the Debian packages of the
`python:3.13-slim-trixie` base image (various licences; each package's copyright file is in
the image under `/usr/share/doc/<package>/copyright`).

This summary is not exhaustive. Generate the full lists from the lockfiles with:

    cd backend && uv run --with pip-licenses pip-licenses --from=mixed --format=markdown
    cd web && npx --yes license-checker-rseidelsohn --production --summary

## Trademarks

Atlantic, Sauter, Cozytouch, Overkiz, Enedis, Linky and MyElectricalData are names of their
respective owners, used only to describe compatibility. Kelvin is not affiliated with them.
