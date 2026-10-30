# Changelog

What changes from one release to the next, in plain words. Versions follow
[Semantic Versioning](https://semver.org/); the image for each one is tagged with its number.

## Unreleased

- **−/+ now sets Confort in Programme**, whatever level runs now. During an Éco period the room says
  « Confort · 20,0 °C » under the control and « Pris en compte à la prochaine plage Confort (17:30) », with
  « Chauffer maintenant… » to start a Chauffe temporaire; the status sentence still says « Programme · Éco
  jusqu’à 17:30 ». Éco is changed in « Températures du programme ».
- **One command after you stop tapping.** Every −/+ tap (or arrow key) shows the new value at once, dashed
  (not sent yet); Kelvin sends one command with the final value 1,5 s after your last tap. Press and hold
  repeats. The slider sends 1,5 s after you let go. Closing the room or leaving the page sends a waiting
  value straight away instead of dropping it.
- **Sauter's Éco limit.** Sauter radiators refuse an Éco lowering of 1 °C (verified on real radiators):
  Éco can now go up to Confort − 2 °C, and at that limit the room says « Éco ne peut pas dépasser
  Confort − 2,0 °C » with « Modifier Confort ». Kelvin refuses such a value before sending it instead of
  letting the radiator refuse it (« Le radiateur a refusé la commande »). Atlantic and Thermor keep 1 °C
  until verified. The API and MCP capabilities say `eco: [2, 8]` on Sauter.
- **Programme › « Modifier les températures »** opens a small sheet over Programme with Confort and Éco
  (same limits, same one-send rule) instead of opening the whole room.
- **The room's slider says what you choose:** while you drag, a bubble on the handle shows the target
  (« 20,5 °C ») and the large figure follows it; the room's reading is a muted « Actuel 17,6° » line, no
  longer orange, and the scale has a label every 2 °C.

## 0.3.3

- A room in the sidebar's « Pièces » list opens over the page you are on (Énergie, Programme, Réglages…)
  instead of taking you back to Maison. Closing it (×, Échap, a tap beside it, Back) leaves the page exactly
  as it was: same view, same period, same scroll. The address says which room is open (`?sheet=p-salon`), so a
  reload or a shared link opens it again. On Maison the « Pièces » list is gone from the sidebar: the tiles
  are the rooms. « Modifier les températures » in Programme opens the room over Programme too.
- Older room links (`/rooms/<id>`) still work: they open the room over Maison.

## 0.3.2

- The Absence sheet no longer jumps when opened straight from `/home#away` during an absence: it waits for the house state, then shows « Absence en cours » once. « Dimanche 18:00 » is gone from the sheet (« Demain 18:00 », « Jusqu’à mon retour », « Date précise… »; « Demain 18:00 » is always the default).
- « Partir en absence » offers « Jusqu’à mon retour »: an absence with no end date, from now until you
  press « Terminer ». The sheet says « Les 2 pièces passeront à 12,0 °C jusqu’à votre retour, puis
  reprendront leur réglage. » (and which rooms are offline); Maison shows « Absence · 12,0 °C · jusqu’à
  votre retour ». Ending it restores every radiator as a dated absence does, an offline one once it is
  back. After 7 days a gentle reminder says « Absence en cours depuis 7 jours ».
- API: `POST /api/house/away` takes `"until": null` (the field stays required); overrides in the house
  view, the SSE and MCP's `get_overview` carry `ends_at: null` and `open_ended: true` for it. New alert
  kind `away_open_long`.

## 0.3.1

- Énergie draws the outdoor temperature over the consumption chart in every view (with a place set in
  Réglages › Météo): each day's mean over the day bars (Semaine, Mois, the 7 days of Jour), each month's
  mean in Année, and the published hours over the Courbe. It has its own °C scale on the right, in its
  colour; the kWh scale on the left now has its figures. Days to come that the 7-day forecast covers are
  drawn dashed and lighter (« prévision »); a missing day or hour is a gap, never filled in.
- « Température extérieure » in the chart's legend shows or hides the line, remembered on the device.
- The day's inspector, the Courbe's readout (« Dehors » for each half-hour), the hidden tables and the
  spoken bar names carry the outdoor temperature.


- « Météo et coût » in Énergie (with a place set in Réglages › Météo): how much your home uses whatever
  the weather, how much more each degree colder adds in kWh and euros, the share of the period due to
  the cold, a chart of every day of the last 12 months against the outdoor temperature, and the cost of
  the next 7 days. Every figure is an estimate with its range (an 8 in 10 chance) and says why when it
  cannot be given; it is never a saving.
- Each room's sensitivity to the cold, from its radiators' own meters (only days they measured whole),
  on the room sheet and in « Où part l’énergie ».
- Maison says what tomorrow should cost to heat (« Demain : 2 °C → ~2,40 € de chauffage »).
- The month-end projection follows the weather (measured days, the forecast, then seasonal normals)
  and gives its range; the Résumé shows the month's change « à météo égale ».
- A new export, `meteo_<from>_<to>.csv` (each day's outdoor mean, kWh, € and the model's expected kWh).
  The Énergie CSV is unchanged.
- AI assistants (MCP): a read-only `get_weather_model` tool; `get_room_energy` and `get_energy`'s month
  projection carry the new figures.
- Forecasts now reach 7 days (Météo-France for 4 days, then ECMWF), and once a place is set the weather
  history reaches 5 years back (one-time download) for the seasonal normals. Absences started with
  « Partir… » are remembered for a year so the model leaves those days out.
- A house or room command no longer reads « failed » because some radiators are offline: it is
  confirmed for the radiators that took it, says how many were offline (« Confirmé · 2 hors
  ligne »), and each offline room shows that the setting did not reach it. A command for offline
  radiators only says so (« Radiateur hors ligne »). An absence ending while a radiator is offline
  restores it once it is back.
- Maison no longer jumps when an alert arrives: the list keeps what it showed and « 1 nouvelle alerte · Afficher » updates it when you tap. The summary chips stay on one line, « Dehors » last.

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
