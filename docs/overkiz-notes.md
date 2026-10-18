# Overkiz notes (Sauter, verified on real radiators)

Radiator used: a HEKLA P, `io://<gateway-pin>/<serial>#1`, night light `…/<serial>#6`. Date: 2026-10-13.
Tool: `backend/scripts/overkiz_try.py`. Original values read with `show` before the writes: comfort 20, eco 3, mode `internal`, window detection `active`, occupancy activation `inactive`, name `Radiateur`, scheduling type `internal`, and the weekly programme (ORIG below). Every state-changing write was reverted to these values. identify changes no state, and setName was a deliberate no-op with the current name.

| Command | Payload | State observed | Exec result | Reverted |
|---|---|---|---|---|
| setComfortTemperature | [20.5] | core:ComfortRoomTemperatureState=20.5 | FAILED OVERRIDEMODE_ERROR (state applied) | yes → [20], COMPLETED |
| setEcoTemperature | [3.5] | core:EcoRoomTemperatureState=3.5 | FAILED OVERRIDEMODE_ERROR (state applied) | yes → [3], COMPLETED |
| setTimeProgram | payload `[NEW]`, see the block below | core:TimeProgramState equal to NEW, element for element (see below) | COMPLETED | yes: payload `[ORIG]` sent, COMPLETED, state equal to ORIG; a later `show` confirmed Monday's second slot was back to its ORIG value |
| setOpenWindowDetectionActivation | ["inactive"] | core:OpenWindowDetectionActivationState='inactive' | COMPLETED | yes → ["active"] |
| setOccupancyActivation | ["active"] | core:OccupancyActivationState='active' | COMPLETED | yes → ["inactive"] |
| on (#6) | [] | core:LightState='on', core:OnOffState='on' (original 'off') | COMPLETED | yes, via off |
| off (#6) | [] | core:LightState='off', core:OnOffState='off' | COMPLETED | — (restores original) |
| identify | [] | no state change (radiator display blinks) | COMPLETED | n/a |
| setName | ["Radiateur"] | core:NameState='Radiateur' (event emitted even though unchanged) | COMPLETED | n/a (no-op) |

## Mode and manual target (verified 2026-10-13)

The radiator was HEKLA P, starting in mode `internal`, target 20.0, effective 20.0, level `comfort`.

| Step | One action carrying | Events observed | Exec |
|---|---|---|---|
| boost-like | `setOperatingMode(["basic"])`, `setTargetTemperature([21.0])` | OperatingModeState='basic', then TargetTemperatureState=21.0 | COMPLETED |
| restore, mode only | `setOperatingMode(["internal"])` | OperatingModeState='internal' only. TargetTemperatureState **stays 21.0**; effective setpoint goes back to the programme (20.0) | COMPLETED |
| (setup) | `setOperatingMode(["basic"])` | OperatingModeState='basic' | COMPLETED |
| restore, target then mode | `setTargetTemperature([20.0])`, `setOperatingMode(["internal"])` | TargetTemperatureState=20.0, then OperatingModeState='internal' | COMPLETED |

Final state was identical to the start: internal, target 20.0, effective 20.0, comfort.

Conclusions:
- One Action may carry several commands, and they apply in order. Neither command returned OVERRIDEMODE_ERROR.
- In `internal` (programme) mode, `core:TargetTemperatureState` is the remembered manual setpoint. It does not follow the schedule, and switching mode does not reset it. **A restore must send `setTargetTemperature(previous_target)` before `setOperatingMode(previous_mode)`, in the same action**, so the manual setpoint memory is restored too.

### setTimeProgram payloads (shape)

The programme times below are illustrative (the simulator's programme), not the radiator's. The shape, the slot count and the fact that NEW differs from ORIG in exactly one slot are as observed.

NEW, sent as the single parameter; the observed `core:TimeProgramState` event value was identical:

```json
[{"monday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "23:15"}, {"start": "00:00", "end": "00:00"}]}, {"tuesday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"wednesday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"thursday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"friday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"saturday": [{"start": "08:30", "end": "22:45"}, {"start": "00:00", "end": "00:00"}, {"start": "00:00", "end": "00:00"}]}, {"sunday": [{"start": "08:30", "end": "22:45"}, {"start": "00:00", "end": "00:00"}, {"start": "00:00", "end": "00:00"}]}]
```

ORIG, sent to revert; the observed state was identical, and it is also the value read before the test:

```json
[{"monday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"tuesday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"wednesday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"thursday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"friday": [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, {"start": "00:00", "end": "00:00"}]}, {"saturday": [{"start": "08:30", "end": "22:45"}, {"start": "00:00", "end": "00:00"}, {"start": "00:00", "end": "00:00"}]}, {"sunday": [{"start": "08:30", "end": "22:45"}, {"start": "00:00", "end": "00:00"}, {"start": "00:00", "end": "00:00"}]}]
```

## Per-device state reads (verified 2026-10-14, read-only)

Main session, read-only, on the owner's installation: `GET /setup/devices/{url}/states` returns
the same state set as that device in `GET /setup/devices`: 38 of 38 states for the heater device,
3 of 3 for the meter device. So `House.reload_device` can replace a device's states with that
answer without dropping any. Kelvin uses it for the 10-minute reconciliation and for the
device-by-device resync once fewer than two of the day's full setup reads are left.

## Conclusions used by translate.py

- The **eco value is a delta** below comfort. The evidence is two observations of the HEKLA P with comfort 20 and eco 3:
  - **In eco**: a live probe script (2026-10-13 13:48, during the programme's eco period) printed `level=eco`, `effective=17.0`, `comfort=20`, `eco=-3`. The probe's format string is `eco=-{core:EcoRoomTemperatureState}`, so the raw state was 3 and the `-` is only a display prefix. 17.0 = 20 − 3, so effective = comfort − eco.
  - **In comfort**: a device dump captured later during a comfort period, shows `io:TargetHeatingLevelState='comfort'` and `io:EffectiveTemperatureSetpointState=20.0`, so effective = comfort.

  The device also exposes `io:SetpointLoweringTemperatureInProgModeState=3.0`, the same lowering. `setEcoTemperature(3.5)` set `core:EcoRoomTemperatureState=3.5`.
- The **programme payload has the same shape as the state**: a list of 7 one-key dicts (monday…sunday), each with exactly 3 slots, unused slots `00:00–00:00`. `io:InternalExternalSchedulingTypeState` stays `internal`.
- The **identify command is `identify`**; there is no state to expect.
- **`OVERRIDEMODE_ERROR` is common**: comfort and eco both returned it on the first command although the state was applied. Device state is the only reliable confirmation.
- Execution events for success carry `failure='NO_FAILURE'`, not null. Only `state` (COMPLETED / FAILED) is meaningful.
- The order of events is `NOT_TRANSMITTED` → `TRANSMITTED` → state change(s) → final execution state, within about 5–20 s.

## Setup reads and the call budget (2026-10-14, documentation; ruling 8)

The end-user API documentation lists `GET /setup`, `/setup/devices`, `/setup/places` and every
`…/states/refresh` as "1 call per 1d (bulk-load)" per session. `GET /setup/devices/{url}/states`
and `GET /setup/quotas` have no printed limit. Kelvin reads the whole setup at startup, after an
outage and on a password change (at most 3 times in any 24 h, one `SetupReadGuard` whose times
are stored, so a restart does not reset it) and otherwise re-reads one radiator's device states
every 10 minutes. The poller leaves the day's last full read to a restart (it resyncs device
by device instead), and a start with the budget spent builds the house from the stored
structure of the last full read and reads each device's states; with nothing stored it reads
the setup once over the budget (at most once per 24 h). It never sends `states/refresh`: that is a radio action on the radiators.
`GET /api/overkiz/quotas` reads `GET /setup/quotas` only when asked (cached for an hour).

## Setup writes (Kelvin's rules, 2026-10-14) — UNVERIFIED on real hardware

Nothing in this section has run against a real account yet. The five writes below and the room
and house place types are what Kelvin sends, built from the Overkiz API documentation and the
simulator; they are recorded here as **unverified**.

- pyoverkiz 2.2.2 has no place or label writes; `_post` rejects the 201 of place creation and
  retries a POST after a dropped connection. Kelvin sends setup requests itself, once each,
  through the client's session (`kelvin/setup/client.py`), with the same error mapping.
- The allowlisted writes (unverified): create a place, rename a place, delete a place, relocate
  a device to a place, set a device's label. Targeted reads: one place, one device. Everything
  else is refused before a byte is sent.
- Room and house place types (the type Kelvin gives a new room, and the type of the root) are
  unverified: they come from the documentation and the simulator, not from a real place tree.
- pyoverkiz structures `PlaceCreated/Updated/DeletedEvent` into its base `Event`: the listener
  sees the name only, so Kelvin confirms place writes with a targeted `GET /setup/places/{oid}`
  (reads at +5, +15 and +30 s). `DeviceUpdatedEvent` carries `placeOID` and `label` and is
  applied directly.
- An unknown oid may answer 400 « Unknown object » instead of 404: both mean « not found ».

### Real-account check « Kelvin test » — NOT RUN YET

Placeholder. `backend/scripts/places_try.py --write --i-am-watching` creates a temporary place
named « Kelvin test », renames it, deletes it and compares the tree before and after. It needs
the owner present and Kelvin stopped. Record here, once it has run: the date; whether the create
answered 201 and what the place type was; whether place events arrived and with what content;
how long each confirmation took; whether the delete answered 200, 204 or 404 on re-read; and
whether the tree came back unchanged. Until then every statement above stays unverified.

## Energy counters: cadence (main-session observation)

- 2026-10-14, afternoon, 10 minutes of the event listener on the real installation (read-only):
  no `core:ElectricEnergyConsumptionState` and no temperature event at all, the radiators
  likely idle. Counters arrive only when they change (or after a refresh), at irregular times.
- Consequence for the code: readings are written on change, at the time Kelvin learns them; a
  value read again unchanged is no reading (the reported value may lag the meter, so it proves
  no 0). Energy between two readings is spread over the gap, weighted by the working rate when
  the 5-min samples cover at least 80 % of it (idle stretches inside it then read 0), by time
  otherwise; the time after a counter's last change is unknown (`null`) until it changes again.
  The cadence only decides how often figures carry the `apportioned` and `interpolated` flags.
- Still to observe (longer, while radiators heat): the median and maximum gap between counter
  changes while heating and while idle, the step size in Wh, and the range of
  `io:CurrentWorkingRateState` (`RateIndex` clamps it to 0–100). Whether an unchanged value
  re-read later proves that no energy was used depends on that lag; until it is measured,
  Kelvin does not treat it as proof.
- 2026-10-14 23:24 → 2026-10-15 01:24 (2 h), real installation, read-only event listener,
  radiators in off mode: 0 errors; only `core:TemperatureState` changes (8 events from 2
  devices), median gap ≈ 900 s, max 3000 s; no energy, tariff counter, working-rate or
  running-state events. The heating-time cadence remains unverified.

## Night-light brightness (unverified, 2026-10-14)

Kelvin's slider sends `on` then `setIntensity(<1–100>)` to the `DimmerLight` device (`#6`) and
treats the command as done when `core:LightIntensityState` reports the value (both names are in
the real capability dump). No real radiator was written to verify this (owner rule): until the
owner uses it and the state is seen to follow, a slider change that the state never confirms
ends as « Pas de confirmation du radiateur ». Record the observed behaviour here when it is known.

## Midnight slot ends (read-only check, 2026-10-14)

Every real heater's `core:TimeProgramState` was read (no write): each day has three slots and
the third is the empty marker `00:00–00:00`; no slot ends at midnight. So the device encoding of
a midnight end is unverified. Kelvin reads `X–00:00` (X ≠ 00:00) as « until midnight » (24:00),
locks that day, and never writes such a slot; the editor's latest end is one step before
midnight (23:30 on Sauter, see « Programme times » below). A day Kelvin
cannot parse is locked the same way and re-sent exactly as read.

## Reachability and last signal (read-only)

`core:StatusState` (`available` / `unavailable`) is in the real capability dump of the heater
and of each sensor. Kelvin shows the heater's value and raises `radiator_unreachable` after 30
continuous minutes of `unavailable` (counted from Kelvin's own observation). `core:RSSILevelState`
is shown raw (« RSSI 87 »): its scale is not recorded yet; record it here when known.

## Programme days Kelvin does not rewrite (2026-10-15)

Kelvin writes each day as its comfort slots sorted by start (`{"start", "end"}` in that key
order), then `00:00–00:00` markers, three entries in all — the shape the real radiator reported
and echoed back (see the `setTimeProgram` payloads above). A day in any other shape — a slot
ending at midnight, unsorted slots, another entry count, other keys or key order, anything
unreadable — is shown locked and re-sent exactly as read on every programme send. Whether the
device ever reports another shape is not verified; record it here if seen.

## Programme times the radiators keep (2026-10-17, owner's report; read-only check)

Two room-level `setTimeProgram` sends to a room of two HEKLA radiators, a few minutes apart, each one
action with one command per radiator (Kelvin's `command_log` and the house state Kelvin held
afterwards; nothing was sent for this check):

| Send | Times in the payload | What both radiators then held | Kelvin's verdict then |
|---|---|---|---|
| 1 | every time on the hour or half hour | the payload, day for day | confirmed by the state event within seconds |
| 2 | the same, but the weekday evening slot starting at **17:45** | the weekday evening slot starting at **17:00**; every other time as sent | `no_confirmation` after 90 s |

- **Sauter radiators keep programme times in 30-minute steps** (the owner's statement, consistent with
  everything observed): a `:45` start was **not kept**, every time any real heater of the house holds
  (all rooms, read-only) is on `:00` or `:30`, and the Cozytouch app offers 30-minute steps. The
  `06:15` / `22:45` in the `setTimeProgram` payloads above are the simulator's, never the radiator's.
- **What the radiator does with a time off its step:** `17:45` sent, `17:00` kept on both radiators,
  every other time unchanged. Not « nearest half hour » (18:00), not « floor to the half hour »
  (17:30), and not a plain floor to the hour either (`05:30`, `06:30` were kept as sent). So a time on
  `:00`/`:30` is kept as is and a time off the step loses its minutes (back to the hour). Whether `:15`
  does the same (17:15 → 17:00) is not verified; Kelvin no longer sends either.
- Kelvin now holds the step per device kind (`Profile.program_step`, 30 everywhere until a finer one
  is verified), refuses a new time off it before sending (`program_step`), and the editor only makes
  times on the room's step (the coarsest of its radiators), the last end at 23:30. A time the radiator
  already holds (the simulator's 06:15) is still accepted: it evidently keeps it.
- If the radiators still keep something else, Kelvin says so as soon as the execution is reported:
  it reads the radiators once and fails the command with `program_differs`, naming the first day and
  the time kept instead of the one sent (« lundi : le radiateur a gardé 17:00 au lieu de 17:45 »), and
  the editor shows what the radiators hold.
- The state that did arrive was a full `core:TimeProgramState`; Kelvin compares it by meaning (days
  in any order, slots sorted, empty markers dropped, `HH:MM:SS` read as `HH:MM`), never byte for
  byte. A different shape from these radiators has still not been seen.
- The server logs of that time held only the access log (no command timing); Kelvin now logs each
  command's label, how it settled (event or read) and after how long, and the differing days.

## One action, some radiators offline (2026-10-18, owner's report; read-only check)

« Absence · 18,0 °C » from Maison on a house of four HEKLA radiators: two in one room reachable,
two (one per bedroom) powered off at the breaker, `core:StatusState` `unavailable` for 1 h 40 before
(Kelvin's `command_log`, its `samples`, its `radiator_unreachable` alerts and the server log;
nothing was sent for this check):

- Kelvin sent **one action** with `setOperatingMode basic` + `setTargetTemperature 18` for each of
  the four heaters (every radiator with a manual setpoint, reachable or not).
- **The two reachable radiators applied it**: their samples went from programme 20 °C to manual
  18 °C within 9 s of the send and held it. The states that confirm an away (`core:OperatingModeState`
  `basic`, `core:TargetTemperatureState` `18.0`) match what Kelvin expects: the matcher was not at fault.
- **The two unreachable radiators took nothing**: their samples kept their earlier mode and setpoint,
  and they stayed `unavailable` (still so 5 h later). Whether Overkiz would deliver it once one comes
  back is not verified; Kelvin does not count on it.
- **The execution was reported `FAILED`** (Kelvin's verdict came at 23 s = the execution's failure
  ~8 s + the 15 s grace, code `radiator_refused`), although half of its commands applied.
- Kelvin then judged the command as a whole: the targeted read of the two offline heaters showed
  their old states, so the whole command failed, the toast said so and a `command_failed` alert
  was raised, while the absence was running in the room that could take it.

Since then a command is judged radiator by radiator (`CommandService._outcome`): it is confirmed
as soon as every radiator holds its expected states, **or every one that does not is
`unavailable` while at least one took it** (« Confirmé · 2 hors ligne », `offline` in the pending).
A command none of its radiators could take because all are offline fails with `radiator_offline`;
a reachable radiator that does not take it still fails the command as before. Kelvin keeps
sending to offline radiators (harmless: the others apply; the Absence sheet already warns that
an offline room may not get the setting). An away's restore confirmed for the reachable radiators
keeps the offline ones in the override and retries them with the restore backoff, so a radiator
that took the away and went offline before its end is restored once it is back. The simulator
now behaves the same way (an `unavailable` device takes nothing; the action reports
`FAILED ACTUATORNOANSWER`); the real failure code for an unreachable device is not recorded yet.

## Multi-brand (2026-10-14) — UNVERIFIED

Nothing in this section has been tried on a real device. It records what Kelvin sends for device
kinds other than the Sauter radiators verified above, and where each name comes from. Move an entry
to a verified section only after a real, reverted test (owner watching).

- **Servers.** pyoverkiz 2.2.2: Sauter, Atlantic and Thermor Cozytouch share one endpoint
  (`ha110-1.overkiz.com`) and pyoverkiz's Cozytouch login. Kelvin offers as « experimental » every
  other server pyoverkiz logs in to with an email and a password (Somfy Europe/America/Oceania,
  Hi Kumo x3, Flexom, Nexity, Brandt, Hexaom, SIMU LiveIn2, Ubiwizz). Rexel needs an OAuth code,
  `Server.SOMFY` is marked experimental inside pyoverkiz: not offered.
- **Classification.** By widget (`UIWidget`), then by UI class (`UIClass`): `WaterHeatingSystem` ->
  water heater, `HeatPumpSystem` -> heat pump, `HeatingSystem` or a widget containing « Heater »
  (not a sensor) -> unknown heater (read-only radiator). Every widget and UI class the simulator
  houses use is a pyoverkiz 2.2.2 enum value (`tests/test_fake_houses.py` pins them).
- **Adjustable-setpoint heaters on Atlantic/Thermor** (`AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint`):
  the Sauter profile, unchanged (`setOperatingMode` `standby`/`basic`/`internal`, `setTargetTemperature`,
  `setComfortTemperature`, `setEcoTemperature`, `setTimeProgram`). Expected to behave as on Sauter.
- **Pilot-wire heaters** (`AtlanticElectricalHeater`): `setHeatingLevel(<level>)` with
  `comfort`, `comfort-1`, `comfort-2`, `eco`, `frostprotection`, `off` (only the values the state
  definition of `io:TargetHeatingLevelState` lists, when it lists any); confirmed by
  `io:TargetHeatingLevelState`. Kelvin reads « Arrêt » for `off`, « Manuel » for any other known level.
  Unknown: whether `core:OnOffState` also follows, and how quickly.
- **Towel dryers** (`AtlanticElectricalTowelDryer`): modes through `setTowelDryerOperatingMode`
  (`standby`, `external` = manual, `internal` = programme), confirmed by `core:OperatingModeState`;
  manual setpoint `setTargetTemperature`; `setTowelDryerTemporaryState` `boost` / `drying` /
  `permanentHeating` (back to normal), confirmed by `io:TowelDryerTemporaryStateState`. Kelvin's boost
  and away restore the target, then the mode, as on Sauter: the order is unverified for dryers.
  Not used: `setTowelDryerTimeProgram` (payload unknown), `setTowelDryerBoostModeDuration`,
  `setDryingDuration`, `setDerogatedTargetTemperature`.
- **Never commanded:** water heaters, heat pumps, unknown heating devices, any non-heating device.
