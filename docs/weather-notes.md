# Weather notes

Open-Meteo behaviour Kelvin depends on (outdoor weather, « Dehors »).
Coordinates here are public places only (town centres); never a home's.

## Open-Meteo: verified behaviour

Verified on 2026-10-17 against the docs pages `/en/docs/meteofrance-api`, `/en/docs/historical-forecast-api`,
`/en/docs/historical-weather-api`, `/en/docs/geocoding-api`, `/en/terms`, `/en/pricing` and `/en/license`, and one
live request per endpoint at public coordinates (Paris centre 48.85, 2.35; geocoding of « Chamonix » and
« Villeurbanne »).

| Fact | Value |
|---|---|
| Météo-France forecast | `GET api.open-meteo.com/v1/meteofrance`; `models` accepts `meteofrance_arome_france_hd`, `meteofrance_seamless` (also `meteofrance_arome_france`, `meteofrance_arpege_europe`, `meteofrance_arpege_world`, `_15min` variants); AROME France HD: 0.01° (~1.5 km), hourly, 2 days, updated every 3 h; `forecast_days` 0–4; `past_days` accepted |
| Several models | the hourly keys become `temperature_2m_<model>` (e.g. `temperature_2m_meteofrance_arome_france_hd`), each nullable; AROME HD is null beyond its horizon and outside France |
| AROME HD variables | `temperature_2m`, `apparent_temperature`, `relative_humidity_2m` filled; `cloud_cover`, `sunshine_duration` null |
| Historical forecast | `GET historical-forecast-api.open-meteo.com/v1/forecast` with `start_date`/`end_date` (inclusive); AROME France HD from **2022-11-13** (null before); same parameters as the forecast API |
| Archive | `GET archive-api.open-meteo.com/v1/archive`, `models=era5_land` (also `era5`, `era5_seamless`, `best_match`); ERA5-Land 0.1°, from 1950, « daily with 5 days delay » (recent hours null); snaps to its grid (48.90, 2.40 for Paris) |
| Time | `timeformat=unixtime` → epoch seconds (UTC); `timezone` sets a **fixed** offset for the whole response (« DST changes within the requested range are ignored »), so Kelvin never asks Open-Meteo for daily aggregates: it builds Paris days from hourly epochs itself |
| Elevation | `elevation=<m>` downscales; omitted → a 90 m DEM; `nan` disables |
| Units | `temperature_unit=celsius` (default); `hourly_units` say `°C`, `%` |
| Geocoding | `GET geocoding-api.open-meteo.com/v1/search?name=&count=(≤100)&language=&countryCode=&format=json`; results carry `name`, `latitude`, `longitude`, `elevation`, `feature_code`, `country_code`, `admin1` (région), `admin2` (département), `postcodes`, `timezone`, `population`; **no `results` key** when nothing matches; 1 character → nothing, 2 → exact, 3+ → prefix; « Location data based on GeoNames » |
| Errors | HTTP 400 `{"error": true, "reason": "…"}`; the service may answer « The service is overloaded » |
| Free tier | « Less than 10'000 API calls per day, 5'000 per hour and 600 per minute »; 300 000 a month; non-commercial only |
| Weighting | « Requests for data covering more than 10 weather variables or extending over a period of more than 2 weeks for a single location are considered multiple API calls … fractional counts » (15 variables × 2 weeks = 1.5; 4 weeks = 3.0) |
| Licence | API data CC BY 4.0: « You must include a link next to any location Open-Meteo data are displayed », example `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`; sources listed: Météo-France (its open-data licence, donneespubliques.meteofrance.fr), Copernicus C3S (ERA5), GeoNames (CC BY) |

Findings Kelvin's code relies on:

- Multi-model keys are suffixed by the model: `temperature_2m_meteofrance_arome_france_hd`,
  `temperature_2m_meteofrance_seamless`, and the same for `apparent_temperature` and `relative_humidity_2m`.
- AROME HD returns `cloud_cover` and `sunshine_duration` as null: Kelvin does not take them.
- The historical forecast API returns AROME HD as null before 2022-11-13 (`AROME_HD_SINCE`).
- ERA5-Land is null for the last ~5 days and snaps the coordinates to its 0.1° grid.
- Geocoding with no match returns an object without a `results` key (not an empty list).
- `timezone` is one fixed offset per response: Kelvin asks for `timeformat=unixtime` and builds Paris days itself.
- Weighting, quoted: « Requests for data covering more than 10 weather variables or extending over a period of more
  than 2 weeks for a single location are considered multiple API calls … fractional counts ». Kelvin counts
  `max(1, series / 10) × max(1, days / 14)` with `series = variables × models`.
- Licence, quoted: « You must include a link next to any location Open-Meteo data are displayed ».
- ECMWF outlook (forecast days 5–7 in France, verified live 2026-10-18 by one read-only request at a place in
  France): `GET api.open-meteo.com/v1/forecast?hourly=temperature_2m&models=ecmwf_ifs025&forecast_days=8
  &timeformat=unixtime` answers 192 hourly values with no null; `best_match` is the fallback should the model
  ever be refused (`OUTLOOK_MODEL` in `weather/client.py`). Weight 1 per call (1 series × 8 days), 4 a day.
- The 5-year backfill (climate normals, Plan 15): about 131 weighted calls once per place, within the 300 a run.

## Not verified

- Whether `models` multiplies the weight. Kelvin counts each model's series (it can only over-count).
- The exact domain edge of AROME France HD. Kelvin falls back per hour to `meteofrance_seamless` wherever AROME HD
  is null.
- Whether one `models=ecmwf_ifs025` answers unsuffixed keys (`temperature_2m`) or suffixed ones
  (`temperature_2m_ecmwf_ifs025`): Kelvin accepts both.
- ECMWF open data's licence wording through Open-Meteo (CC BY 4.0, « Contains modified ECMWF data »): to confirm
  before the README and Third-party notices quote it.
