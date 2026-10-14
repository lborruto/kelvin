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

## Mode and manual target (verified 2026-10-13, after the final review, I5)

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
device-by-device resync once the daily budget of full setup reads is spent.

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
