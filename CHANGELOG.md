# Changelog

What changes from one release to the next, in plain words. Versions follow
[Semantic Versioning](https://semver.org/); the image for each one is tagged with its number.

## Unreleased

- A house or room command no longer reads « failed » because some radiators are offline: it is
  confirmed for the radiators that took it, says how many were offline (« Confirmé · 2 hors
  ligne »), and each offline room shows that the setting did not reach it. A command for offline
  radiators only says so (« Radiateur hors ligne »). An absence ending while a radiator is offline
  restores it once it is back.

## 0.2.0

- Outdoor temperature (optional, off until you pick a place in Réglages › Météo): a « Dehors » chip
  on Maison with its exact value, feels-like, humidity and today's range; the outdoor temperature
  under each room's chart; in Énergie, each bar's mean outdoor temperature and degree days, and
  how your use changed at equal weather next to the plain comparison. It uses Météo-France's AROME
  model through Open-Meteo; only your place's position (to about 1 km) and altitude leave Kelvin,
  and « Supprimer » removes the place and its history.
- The Énergie CSV gets three columns at the end: `dehors_moy_c`, `dju_base18`, `meteo_jours`
  (empty without a place).
- AI assistants (MCP): a read-only `get_weather` tool; `get_energy` gives the outdoor figures too.
  The place itself is never given.

## 0.1.1

- Room chart: hover, tap or use the arrow keys to read any moment (temperature per radiator, setpoint and level, heating, presence, window; min, mean and max over 7 and 30 days).
- Room chart: the scale fits the data instead of starting at 0°; presence is a thin strip at the bottom.
- README: plain wording.

## 0.1.0 — first public release

The first version anyone can install.

### Heating

- Control electric radiators on Cozytouch: Sauter (tested on real radiators), Atlantic and
  Thermor (expected to work), other Overkiz servers (experimental, read-mostly).
- Rooms first: Cozytouch rooms become Kelvin's rooms; a room with two radiators acts as one.
- Off, manual and schedule modes, the setpoint, a temporary boost, and « Partir… » (away) for the
  whole house, with everything put back the way it was afterwards.
- The weekly schedule, edited in Kelvin and written to the radiators themselves, so it keeps
  running when Kelvin or the internet is down. Days Kelvin cannot edit are shown and left alone.
- A change counts as done only when the radiator reports it: pending, confirmed and failed are
  shown as such.
- Rooms and devices managed from Kelvin: create, rename and delete rooms, move or rename a
  radiator; changes made in the Cozytouch app show up in Kelvin.

### Energy and bills

- The Linky meter through MyElectricalData: daily figures and the half-hour curve.
- Each radiator's own energy, split by room, with honest gaps: what is not known is shown as
  unknown, never as zero.
- An electricity-bill estimate for Base, off-peak/peak and Tempo prices, with past price
  changes kept, and a projection for the period.
- Tempo colours and EcoWatt grid signals, and calm alerts (a red Tempo day tomorrow, a radiator
  out of reach, a price change).
- A CSV export of the figures.

### The app

- One dark dashboard (« Maison ») for phone and desktop, then Programme, Énergie and Réglages.
- French and English throughout, errors included.
- Every exact figure, its source and its freshness one tap away; the screens stay calm.
- An installable web app with an offline screen.
- A simulator of a whole home and a synthetic Linky, for trying Kelvin without hardware.
- A read-only MCP endpoint so an AI assistant can read (never change) your heating and energy
  data, with tokens you create and revoke in Réglages.

### Running it

- One Docker image (amd64 and arm64), running as an unprivileged user, with an example Docker
  Compose file: published on this machine only (127.0.0.1) by default, with the address, port
  and data volume set in `.env`.
- Login with the home's own Cozytouch account; signed-in browsers listed and revocable.
- A Host allowlist (`KELVIN_ALLOWED_HOSTS`), and a warning when Kelvin can be reached from other
  machines without one.
