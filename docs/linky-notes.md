# MyElectricalData notes (verified with the real token)

Date: 2026-10-14. Tool: `backend/scripts/med_capture.py` (5 read-only calls). Fixtures:
`backend/tests/fixtures/med/` keep the real response shapes with synthetic values (PDL 12345678901234,
customer id 0000000000).

- Base `https://www.myelectricaldata.fr`, header `Authorization: <token>`. Quota 50 calls/day,
  reset at 23:59:59 (`valid_access`). Kelvin's own budget is 10/day.
- `valid_access/{pdl}`: `valid`, `information`, `consent_expiration_date`, `call_number`,
  `quota_limit`, `quota_reached`, `quota_reset_at`, `last_call`, `ban`.
- `contracts/{pdl}`: `subscribed_power` e.g. "9 kVA", `offpeak_hours` e.g. "HC (22H00-6H00)",
  `last_activation_date` e.g. "2025-01-15+01:00" (Enedis has no data before it), `distribution_tariff`
  "BTINFMU4", `segment` "C5", `contract_status` "SERVC". No name, address, email or phone field.
- `daily_consumption`: unit `Wh`, `measuring_period` P1D, `aggregate` sum, values as strings, one
  reading per day dated `YYYY-MM-DD`, `end` exclusive, `quality` `BRUT`.
- **A day Enedis has not published yet is NOT an error or an empty answer.** Requesting
  `start=2026-10-14/end=2026-10-15` on 2026-10-14 returned HTTP 200 with
  `meter_reading.start = 2026-10-13`, `end = 2026-10-14` and D-1's reading. MED shifts the window
  back. `MedSource` therefore keeps only readings inside the requested `[start, end)` (daily) and
  intervals starting inside it (curve); see `test_unpublished_day_returns_previous_day_and_is_dropped`.
- `consumption_load_curve`: `measurement_kind` power, unit `W`, `aggregate` average,
  `interval_length` `PT30M`, `measure_type` `B`, `quality` `BRUT`. Dates are
  `"YYYY-MM-DD HH:MM:SS"`, naive local time. The first point of a `start=2026-10-12` request is
  dated `2026-10-12 00:30:00` and the last `2026-10-14 00:00:00`, so `date` marks the **END** of
  the interval (`CURVE_DATE_IS_END = True`). 48 points per normal day.
- 429 (Enedis "Message throttled out", seen on the first probe on 2026-10-14 early morning):
  `{"detail": "<JSON string with code 900804 and nextAccessTime '2026-Oct-14 07:00:00+0000 UTC'>"}`.
  It cleared by 09:00 local the same day.
- DST days were not captured: the contract started after the last change. The parser handles
  them by order (see `kelvin/linky/med.py`), and the tests use synthetic DST payloads.
  Capture the 2026-10-25 curve after that date to confirm.

## First real sync (Kelvin, 2026-10-14)

- Login: setup mode → the first Cozytouch login started the runtime (3 rooms found); `account.json`
  mode 0600; a second login with the stored password was accepted without an Overkiz call.
- Linky configure = 2 calls (`valid_access`, `contracts`). The prefill matched the contract
  (subscribed power and both off-peak slots).
- First sync: the daily request returned every day since the contract start. The first
  curve request got an Enedis 429 with a `nextAccessTime` 2 minutes later; Kelvin waited and
  resumed on its own, then fetched the 30-day window plus one extension chunk before reaching its
  own budget (10/10 calls, state `quota`). The rest of the curve arrives on the following days.
- No token or password in the database, the log or API responses; no PDL in the log.
