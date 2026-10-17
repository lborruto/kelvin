import type { ApiParams } from '$lib/i18n';

export type Mode = 'off' | 'manual' | 'program' | 'other';
export type RoomMode = Mode | 'mixed';
export type SettableMode = 'off' | 'manual' | 'program';
/** Plan 12: what a radiator is and what Kelvin can do with it. */
export type DeviceKind = 'setpoint_heater' | 'pilot_wire_heater' | 'towel_dryer' | 'heater_unknown';
export type Support = 'tested' | 'expected' | 'experimental' | 'readonly';
export type PilotLevel = 'comfort' | 'comfort-1' | 'comfort-2' | 'eco' | 'frostprotection' | 'off';
export type DryerState = 'boost' | 'drying';
export type DryerAction = DryerState | 'stop';

export interface Capabilities {
  modes: SettableMode[];
  manual: [number, number] | null;
  comfort: [number, number] | null;
  eco: [number, number] | null;
  levels: PilotLevel[];
  program: boolean;
  /** With `program`: the programme times the radiator keeps, in minutes (30 on Sauter). */
  program_step_minutes?: number | null;
  dryer: DryerState[];
  window_detection: boolean;
  presence_detection: boolean;
  night_light: boolean;
  night_light_intensity: boolean;
  identify: boolean;
  energy: boolean;
  boost: boolean;
  /** The heater's Cozytouch label can be changed (a setup write, Plan 8b): the rename pencil needs it. */
  rename: boolean;
  read_only: boolean;
}

export interface ServerInfo {
  id: string;
  /** pyoverkiz's product name (« Sauter Cozytouch »): never translated. */
  name: string;
  tier: 'cozytouch' | 'experimental';
  default: boolean;
}
export interface ServerList {
  servers: ServerInfo[];
  /** The home's server once claimed; null in setup mode. */
  current: string | null;
}

export type SetpointKind = 'manual' | 'comfort' | 'eco';
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = (typeof DAYS)[number];
export type DayLock = 'midnight' | 'unrecognised';

export interface Slot {
  start: string;
  end: string;
}
export type WeekProgram = Partial<Record<Day, Slot[]>>;

export interface Radiator {
  id: string;
  room_id: string;
  name: string;
  model: string | null;
  power_w: number | null;
  temperature: number | null;
  mode: Mode;
  target: number | null;
  comfort: number | null;
  eco_delta: number | null;
  eco: number | null;
  effective_setpoint: number | null;
  heating_level: string | null;
  max_temperature: number;
  window_open: boolean | null;
  occupied: boolean | null;
  window_detection: boolean;
  presence_detection: boolean;
  light: { on: boolean; intensity: number | null } | null;
  energy_wh: { total: number; t1: number | null; t2: number | null } | null;
  working_rate: number | null;
  rssi: number | null;
  program: WeekProgram;
  /** core:StatusState: null when the radiator does not report it (Plan 8). */
  reachable?: boolean | null;
  /** When Kelvin saw it become unreachable (epoch s); null when that is unknown. */
  unreachable_since?: number | null;
  /** Last state event from any of its devices since Kelvin started (epoch s). */
  last_event_at?: number | null;
  /** Days Kelvin shows but never edits (QW8). */
  program_locked?: Partial<Record<Day, DayLock>>;
  /** Plan 12 (absent from older backends: a Sauter setpoint heater). */
  kind?: DeviceKind;
  support?: Support;
  capabilities?: Capabilities;
  dryer?: DryerState | null;
}

export interface Room {
  id: string;
  name: string;
  /** The house itself (radiators in no room). */
  is_root?: boolean;
  radiator_ids: string[];
  temperature: number | null;
  mode: RoomMode | null;
  target: number | null;
  comfort: number | null;
  eco: number | null;
  effective_setpoint: number | null;
  heating_level: string | null;
  window_open: boolean;
  occupied: boolean;
  presence?: boolean | null;
}

export interface Expected {
  mode?: Mode;
  target?: number;
  comfort?: number;
  eco_delta?: number;
  light_intensity?: number;
  level?: string;
  dryer?: DryerState | null;
}

/** `unconfirmed`: a setup write Cozytouch accepted but did not confirm in time. Not an error:
 * it may still apply, and the next full read settles it. */
export type PendingStatus = 'sending' | 'pending' | 'confirmed' | 'failed' | 'unconfirmed' | 'superseded';
export interface Pending {
  id: string;
  label: string;
  radiator_ids: string[];
  status: PendingStatus;
  error: string | null;
  created_at: number;
  expected: Record<string, Expected>;
  /** Codes the web translates (backend kelvin/labels.py, kelvin/errors.py); absent on older servers. */
  label_code?: string | null;
  label_params?: ApiParams;
  error_code?: string | null;
  error_params?: ApiParams;
  reason_code?: string | null;
  /** Setup writes (rooms and devices) only. */
  kind?: 'setup';
  room_id?: string | null;
  progress?: { done: number; total: number } | null;
}

export interface Override {
  id: string;
  kind: 'boost' | 'away';
  room_id: string | null;
  radiator_ids: string[];
  temperature: number;
  ends_at: number;
  restoring: boolean;
  /** When it started (epoch s); null for one stored before Kelvin kept it, absent from older backends. */
  created_at?: number | null;
}

export interface Status {
  connected: boolean;
  last_ok_at: number | null;
  last_error: string | null;
  /** Why the last poll failed, as a code the web words (backend gateway_error_code). */
  last_error_code?: 'quota' | 'auth' | 'network' | 'unknown' | null;
  auth_rejected?: boolean;
}

export interface HouseView {
  rooms: Room[];
  radiators: Radiator[];
}

export type TempoColour = 'blue' | 'white' | 'red';
export interface EcowattRun { start: string; end: string; level: number }
export interface GridView {
  tempo: {
    today: { date: string; colour: TempoColour | null };
    tomorrow: { date: string; colour: TempoColour | null; expected_at: string | null };
    fetched_at: number | null;
  } | null;
  ecowatt: { days: { date: string; level: number; hours: EcowattRun[] | null }[]; fetched_at: number | null };
  source: string;
}
export type SourceState = 'off' | 'never' | 'ok' | 'error' | 'quota';
export interface SourceStatus {
  state: SourceState;
  last_ok: number | null;
  error_since: number | null;
  next: number | null;
  enabled: boolean;
}
export interface Sources {
  tempo: SourceStatus;
  ecowatt: SourceStatus;
  med: { calls_today: number; grid_calls_today: number; budget: number };
  /** Plan 14: the forecast job's state; null when the backend has no weather service (absent on older backends). */
  weather?: WeatherSource | null;
}
export interface StatusView {
  status: string;
  overkiz: Status;
  linky: string | null;
  sources?: Sources | null;
}

export interface Snapshot {
  house: HouseView;
  pending: Pending[];
  /** Commands settled in the last minutes: the real outcome for a client that missed it. */
  recent?: Pending[];
  overrides: Override[];
  status: Status;
  alerts?: AlertSummary;
  grid?: GridView | null;
  /** Plan 14: the outdoor temperature (null without a weather place; absent on older backends). */
  weather?: WeatherView | null;
}

// — Weather (Plan 14, spec §4, §7): the API contract of `GET /api/weather*` and `/api/settings/weather` —

/** The model behind an hour: Kelvin's codes (`arpege` is Météo-France seamless beyond AROME's horizon). */
export type WeatherModel = 'arome_hd' | 'arpege' | 'era5_land' | 'best_match' | 'simulator' | 'mixed';
/** `GET /api/weather`, the snapshot's and the SSE event's `weather`: never the place or its coordinates. */
export interface WeatherView {
  /** The current hour (epoch s `at`), or null before the first reading. */
  now: { temperature_c: number; apparent_c: number | null; humidity_pct: number | null; at: number; model: WeatherModel | string } | null;
  /** Today (Paris civil day): lowest and highest hour, `*_ahead` when that hour is still a forecast. */
  today: { min_c: number; min_at: number; min_ahead: boolean; max_c: number; max_at: number; max_ahead: boolean; hours: number } | null;
  /** Epoch s of the newest fetch among today's hours. */
  fetched_at: number | null;
  mode: 'meteofrance' | 'best_match';
  /** The forecast job (the « — » reason): `next` and `error_since` epoch s. */
  fetch: { state: SourceState; next: number | null; error_since: number | null } | null;
}
/** A geocoder result (`GET /api/weather/search`): coordinates already rounded to 0.01°. */
export interface WeatherPlace {
  name: string;
  admin1: string | null;
  admin2: string | null;
  country_code: string | null;
  lat: number;
  lon: number;
  elevation_m: number | null;
}
export interface WeatherLocation extends Omit<WeatherPlace, 'name'> {
  name: string | null;
  elevation_source: 'geocoder' | 'owner' | 'none';
  origin: 'search' | 'manual';
  mode: 'meteofrance' | 'best_match';
}
/** `GET|PUT /api/settings/weather` (session only: the one place the location is returned). */
export interface WeatherSettings {
  location: WeatherLocation | null;
  /** Days stored (ISO); `from` is the first day the backfill aims for. */
  coverage: { first_day?: string; last_day?: string; complete_days?: number; from: string } | null;
  calls_today: number;
  budget: number;
  attribution: { url: string; licence: string };
}
/** `PUT /api/settings/weather`. */
export interface WeatherLocationBody {
  lat: number;
  lon: number;
  elevation_m?: number | null;
  name?: string | null;
  admin1?: string | null;
  admin2?: string | null;
  country_code?: string | null;
  origin: 'search' | 'manual';
}
/** `GET /api/weather/hourly`: past hours only (epoch s `ts`, °C `t`). */
export interface WeatherHourly {
  step: number;
  points: { ts: number; t: number; model: WeatherModel | string }[];
}
/** `/api/status` `sources.weather`: the forecast job, plus the backfill job's state and the day's weighted calls. */
export interface WeatherSource extends SourceStatus {
  backfill: SourceState;
  calls_today: number;
  budget: number;
}
/** A summary's outdoor figures over its elapsed days (`of`); `days` those with a complete weather day. */
export interface Outdoor {
  mean_c: number | null;
  min_c: number | null;
  max_c: number | null;
  /** DJU base 18 °C; null unless every elapsed day has weather. */
  dju: number | null;
  days: number;
  of: number;
}
export type WeatherWhy = 'not_comparable' | 'weather_missing' | 'mild_period' | 'few_days' | 'few_heating_days' | 'poor_fit';
/** A comparison row's change at equal weather (spec §6.3), or null with `why`. */
export interface WeatherRow {
  change: number | null;
  why: WeatherWhy | string | null;
  dju_cur: number | null;
  dju_ref: number | null;
  expected_cur_kwh: number | null;
  expected_ref_kwh: number | null;
  model: { baseload_kwh_day: number; kwh_per_dju: number; r2: number; fit_days: number } | null;
}

export interface HistoryPoint {
  radiator_id: string;
  ts: number;
  temperature: number | null;
  setpoint: number | null;
  target: number | null;
  /** The bucket's lowest and highest reading, its mean working rate (% of full power), and the modes and
   * heating levels seen in it (sorted). Absent from older backends. */
  temperature_min?: number | null;
  temperature_max?: number | null;
  working_rate?: number | null;
  modes?: string[];
  levels?: string[];
}

export interface EnergyBucket {
  bucket: string;
  radiator_id: string;
  kwh: number;
  t1_kwh: number | null;
  t2_kwh: number | null;
  interpolated: boolean;
  apportioned: boolean;
  complete: boolean;
}

export interface CommandResult {
  pending: Pending | null;
}

export interface Me {
  email: string | null;
  logged_in: boolean;
  setup?: boolean;
  /** The stored Cozytouch password was refused: log in with the new one. */
  reauth?: boolean;
  simulator?: boolean;
  /** The home's server once logged in (Plan 12). */
  server?: ServerInfo | null;
}
export type TariffOption = 'base' | 'hchp' | 'tempo';
export interface TariffRow extends PriceRow {
  option: TariffOption;
  hc_eur_kwh?: number;
  hp_eur_kwh?: number;
}
export interface HcVariant {
  months: number[];
  slots: Slot[];
}
export interface HcSchedule {
  valid_from: string;
  variants: HcVariant[];
}
export interface TempoHours {
  hc_start: string;
  hc_end: string;
  day_start?: string;
}
export interface Tariff {
  option: TariffOption;
  kva: number;
  hc_slots: Slot[];
  hc_schedules: HcSchedule[];
  tempo_hours: TempoHours;
  prices: TariffRow[];
}
export interface SettingsView {
  tariff: Tariff | null;
  /** From the Enedis contract (subscribed power, off-peak hours); prefills the form. */
  prefill: { kva: number | null; hc_slots: Slot[] } | null;
}
export interface TariffDoc {
  kva: number;
  prices: { valid_from: string; option: TariffOption; subscription_eur_month: number; rates: Record<string, number> }[];
  hc_schedules: HcSchedule[];
  tempo_hours: { hc_start: string; hc_end: string };
}
export interface TempoPrices {
  rates: Record<string, number>;
  fetched_at: number;
  source: string;
}
export type LinkyState = 'off' | 'never' | 'ok' | 'auth' | 'throttled' | 'quota' | 'error';
export interface LinkyStatus {
  configured: boolean;
  prm: string | null;
  token_set: boolean;
  simulator: boolean;
  state: LinkyState;
  message: string | null;
  last_day: string | null;
  last_ok_at: number | null;
  retry_at: number | null;
  calls_today: number;
  budget: number;
  consent_expires: string | null;
}
export type EnergyGroup = 'day' | 'week' | 'month' | 'year';
/** How a bucket's HC/HP split was obtained; `mixed` when its days used different methods. */
export type SplitMethod = 'curve' | 'fallback_window' | 'fallback_month' | 'fallback_all' | 'slots' | 'mixed';
/** A price row a bucket used. `rates` by tariff option: `{hc, hp}` today (Plan 9 adds base and Tempo keys). */
export interface PriceRow {
  valid_from: string;
  subscription_eur_month: number;
  rates: Record<string, number>;
}
/**
 * Radiator energy over a span (spec §2.1). It counts exactly the radiator-days `coverage` counts: elapsed
 * days up to yesterday, never today. The summary's `radiators` is null when nothing is known there (a bucket
 * holding only today included); otherwise it may be partial, and `coverage` < 1 says so.
 */
export interface RadiatorSum {
  kwh: number;
  hc_kwh: number | null;
  hp_kwh: number | null;
  eur: number | null;
  interpolated: boolean;
  apportioned: boolean;
  /** Radiator-days fully measured / radiator-days the radiators existed (elapsed days only). */
  coverage: number | null;
}
/** Figures over the span's complete curve days; the power figures are absent when none is complete. */
export interface CurveSummary {
  complete_days: number;
  kwh: number;
  peak_w?: number | null;
  peak_ts?: number | null;
  base_w_p10?: number | null;
  night_min_w?: number | null;
}
export interface TempoCounts {
  blue: number;
  white: number;
  red: number;
  unknown: number;
}
export interface TempoLens {
  rows: { key: string; kwh: number | null; eur: number | null }[];
  days: TempoCounts;
  unknown_kwh: number | null;
}
export interface EnergySummary {
  tempo: TempoCounts | null;
  by_rate: Record<string, number> | null;
  missing_colour_days: number;
  retro_scheduled: boolean;
  kwh: number | null;
  hc_kwh: number | null;
  hp_kwh: number | null;
  /** Null when Kelvin recorded no day of the span: unknown, not 0. */
  radiators_kwh: number | null;
  energy_eur: number | null;
  subscription_eur: number | null;
  eur: number | null;
  days: number;
  missing_days: number;
  estimated_split: boolean;
  split_method: SplitMethod | null;
  prices: PriceRow[];
  retro_priced: boolean;
  present_days: number;
  curve: CurveSummary | null;
  radiators: RadiatorSum | null;
  /** Linky − radiators, only when every radiator was measured over every day of the span. */
  rest_kwh: number | null;
  /** Plan 14: outdoor °C and DJU over the span; null without a weather place (absent on older backends). */
  outdoor?: Outdoor | null;
}
export interface EnergyReportBucket extends EnergySummary {
  key: string;
}
export interface PeriodSummary extends EnergySummary {
  from: string;
  to: string;
  /** The selected period's own quality facts (`EnergyReport.quality` is the chart window's: in Jour, 7 days). */
  quality: Quality;
}
export interface Heating {
  /** Radiators / Linky over the common days; raw, never clamped (L7). */
  value: number | null;
  days: number;
  of_days: number;
  since: string | null;
  inconsistent: boolean;
}
export interface ByRadiator {
  radiator_id: string;
  /** The radiator's current room; null for a radiator no longer in the house. */
  room_id: string | null;
  kwh: number | null;
  hc_kwh: number | null;
  hp_kwh: number | null;
  eur: number | null;
  coverage: number | null;
  interpolated: boolean;
  apportioned: boolean;
  /** Day of its first reading. */
  from: string | null;
  temp_avg: number | null;
  setpoint_avg: number | null;
  heating_hours: number | null;
}
export interface Comparison {
  from: string;
  to: string;
  pairs: number;
  of: number;
  /** False when more than 20 % of the pairs were dropped: no change is given. */
  comparable: boolean;
  cur_kwh: number | null;
  prev_kwh: number | null;
  cur_energy_eur: number | null;
  prev_energy_eur: number | null;
  change: number | null;
  change_energy_eur: number | null;
  /** Plan 14 (`previous`, `last_year`): the change at equal weather; null without a weather place. */
  weather?: WeatherRow | null;
}
export interface Average4 {
  units: number;
  cur_kwh_per_day: number | null;
  prev_kwh_per_day: number | null;
  change: number | null;
}
/** `basis`: `unit` when the selected period is one unit of the request's `group` (each day paired with the
 * same day of the previous unit), `days` for a custom period (paired with as many days just before it). */
export interface Comparisons {
  basis: 'unit' | 'days';
  previous: Comparison | null;
  last_year: Comparison | null;
  avg4: Average4 | null;
}
export interface HcLens {
  hc_share: number | null;
  slot_share: number | null;
  avg_price: number | null;
  /** P_hp − P_hc at today's prices. */
  delta_price: number | null;
}
export interface Quality {
  fallback_share: number | null;
  fallback_method: SplitMethod | null;
  estimated_days: number;
  curve_vs_daily_pct: number | null;
  linky_since: string | null;
  curve_since: string | null;
  radiators_since: string | null;
  retro_priced_days: number;
  missing_colour_days: number;
  retro_scheduled_days: number;
}
export type ProjectionMethod = 'seasonal' | 'linear';
export interface Projection {
  month: {
    key: string;
    kwh: number;
    eur: number | null;
    actual_kwh: number | null;
    actual_eur: number | null;
    actual_energy_eur: number | null;
    /** Elapsed days without Linky data, estimated at the same rate (M4). */
    filled_days: number;
    method: ProjectionMethod;
  };
  year: {
    from: string;
    to: string;
    kwh: number;
    eur: number | null;
    method: ProjectionMethod | 'mixed';
    months: { key: string; kwh: number; eur: number | null; method: ProjectionMethod }[];
  };
  /** The next 365 days from tomorrow (M5), `to` exclusive. */
  rolling: {
    from: string;
    to: string;
    kwh: number;
    eur: number | null;
    per_day_kwh: number;
    price_eur_kwh: number | null;
    method: ProjectionMethod | 'mixed';
  };
}
export interface EnergyReport {
  group: EnergyGroup;
  from: string;
  to: string;
  last_day: string | null;
  linky: boolean;
  tariff: boolean;
  buckets: EnergyReportBucket[];
  total: EnergySummary;
  heating_share: number | null;
  /** First day of the span the share runs over (days with both Linky and radiator data). */
  heating_share_since: string | null;
  /** The first counted day with Linky data (never before the contract start). */
  linky_since: string | null;
  radiators: { radiator_id: string; kwh: number }[];
  projection: Projection | null;
  /** The selected period (`period_from`/`period_to`): the hero, the panels and the CSV describe it. */
  period: PeriodSummary;
  heating: Heating;
  by_radiator: ByRadiator[];
  comparison: Comparisons;
  hc_lens: HcLens | null;
  option: TariffOption | null;
  tempo_lens: TempoLens | null;
  /** An HC slot edge falls inside a half-hour: those half-hours' HC share is prorated (L11). */
  boundary_prorated: boolean;
  /** Over the chart window (the bars, the Qualité strip); the selected period's are `period.quality`. */
  quality: Quality;
}
/** One half-hour (or one interval) of `/api/energy/day`. */
export interface EnergyInterval {
  ts: number;
  minutes: number;
  wh: number;
  w: number;
  /** Share of the interval inside the HC slots, 0…1; null without a tariff. */
  offpeak: number | null;
  tempo_colour: TempoColour | null;
  boundary: boolean;
  price: number | null;
  eur: number | null;
  /** Null unless every radiator that existed then has a figure (`radiators_known` = `radiators_total`): never a partial sum. */
  radiators_wh: number | null;
  /** Radiators with a figure for this interval, of those that existed then. */
  radiators_known: number;
  radiators_total: number;
  radiators_interp: boolean;
  radiators_apportioned: boolean;
  /** Radiator Wh by current room id; null when a radiator of that room that existed then has no figure. A room
   * with no radiator then is absent. */
  by_room: Record<string, number | null>;
}
export interface RoomSample {
  ts: number;
  temperature: number | null;
  setpoint: number | null;
  working_rate: number | null;
}
export interface EnergyDay {
  date: string;
  complete: boolean;
  points: number;
  intervals: EnergyInterval[];
  totals: {
    curve_kwh: number | null;
    /** The daily reading (what is billed); hc_kwh + hp_kwh = daily_kwh (M7). */
    daily_kwh: number | null;
    hc_kwh: number | null;
    hp_kwh: number | null;
    split_method: SplitMethod | null;
    hc_kwh_curve: number | null;
    hp_kwh_curve: number | null;
  };
  power: { peak_w: number | null; peak_ts: number | null; base_w_p10: number | null; night_min_w: number | null; kva: number | null };
  /** Days with a complete curve, oldest first (never before `counted_from`). */
  available: string[];
  /** The report's first counted day (contract start, not before the backfill window); null when unknown. */
  counted_from: string | null;
  /** A day before `counted_from`: no intervals, `totals` null and `power` null but for `kva` (the tariff's). */
  not_counted: 'before_first_day' | null;
  room: {
    id: string;
    name: string;
    samples: RoomSample[];
    overrides: { id: string; kind: string; temperature: number | null; ends_at: number | null }[];
  } | null;
}

/** `GET /api/rooms/{id}/energy?days=`: the last `days` local days, today included (Plan 8, QW3). */
export interface RoomEnergy {
  /** Local ISO days: the window runs from `from` 00:00 to now; `to` is today. */
  from: string;
  to: string;
  days: number;
  kwh: number | null;
  hc_kwh: number | null;
  hp_kwh: number | null;
  /** Energy only, no standing charge; whole cents by the report's 1-January rule, never rounded here. */
  eur: number | null;
  heating_hours: number | null;
  /** Elapsed days only (today is still running): radiator-days fully measured / radiator-days that existed; null with none. */
  coverage: number | null;
  interpolated: boolean;
  apportioned: boolean;
  priced: boolean;
  /** Days with energy but no € (a Tempo colour not published): why `eur` is null. */
  missing_colour_days?: number;
}
export interface Run {
  start: number;
  end: number;
  open: boolean;
}
export interface RoomActivity {
  step: number;
  window: Run[];
  presence: Run[];
}
export interface RoomsDuty {
  from: number;
  to: number;
  rooms: Record<string, { duty: number | null; coverage: number }>;
}

export interface SessionInfo {
  id: string;
  created: number;
  last_seen: number;
  /** Brand names parsed by the server from the user agent; the raw string never leaves it. */
  browser: string | null;
  os: string | null;
  current: boolean;
}

/** Plan 13: a read-only MCP token. The secret is never listed: only `hint`, its last 4 characters. */
export interface McpToken {
  id: string;
  name: string;
  hint: string;
  scope: 'read';
  created: number;
  last_used: number | null;
  revoked_at: number | null;
}
export interface McpTokenList {
  enabled: boolean;
  endpoint_path: string;
  tokens: McpToken[];
}
export interface McpCreated {
  token: McpToken;
  /** Shown once, in the creation answer only. */
  secret: string;
}
export interface McpAuditRow {
  at: number;
  token_name: string | null;
  kind: 'tool' | 'resource' | 'prompt' | 'auth';
  name: string;
  outcome: 'ok' | 'error' | 'denied' | 'rate_limited';
  error_code: string | null;
  duration_ms: number;
  /** How many attempts the row stands for: refusals are one counted row a minute. */
  count: number;
}

export type Severity = 'info' | 'warn' | 'bad';
export type AlertKind =
  | 'price_change'
  | 'consent_expiring'
  | 'radiator_unreachable'
  | 'command_failed'
  | 'linky_stalled'
  | 'tempo_red_tomorrow'
  | 'ecowatt'
  | 'hc_changed';
export interface Alert {
  id: number;
  /** A kind this bundle does not know (a newer server) is not shown. */
  kind: AlertKind | string;
  severity: Severity;
  params: Record<string, unknown>;
  first_seen: number;
  last_seen: number;
  resolved_at: number | null;
  dismissed: boolean;
}
export interface AlertSummary {
  active: number;
  highest: Severity | null;
}

export type DeviceRole =
  | 'heater' | 'temperature' | 'window' | 'occupancy' | 'energy' | 'light' | 'bridge' | 'box' | 'wifi' | 'other'
  // Plan 12: read-only appliances and heating devices that are no radiator's main device
  | 'water_heater' | 'heat_pump' | 'heating';

export interface SetupDevice {
  id: string;
  role: DeviceRole;
  label: string;
  widget: string;
  room_id: string | null;
  /** A radiator sub-device in another room than its heater. */
  misplaced: boolean;
  reachable: boolean | null;
  last_event_at: number | null;
  /** Raw read-only states the device reports (Cozytouch state name → value). */
  details: Record<string, string | number | boolean>;
  /** Plan 12: a heater's support, `readonly` for an appliance, null for sub-devices and bridges. */
  support?: Support | null;
}

export interface SetupRoom {
  id: string;
  name: string;
  is_root: boolean;
  radiator_ids: string[];
  device_count: number;
  block: 'room_protected' | 'room_not_empty' | null;
}

export interface SetupRadiator {
  id: string;
  room_id: string;
  name: string;
  devices: SetupDevice[];
  kind?: DeviceKind;
  support?: Support;
}

export interface SyncStatus {
  used: number;
  limit: number;
  next_possible_at: number | null;
  last_full_at: number | null;
  stale_since: number | null;
  requested: boolean;
  next_daily_at: number;
}

export interface SetupView {
  rooms: SetupRoom[];
  radiators: SetupRadiator[];
  bridges: SetupDevice[];
  /** Plan 12: every other device (water heaters, heat pumps, anything Kelvin does not drive). */
  appliances?: SetupDevice[];
  sync: SyncStatus | null;
}

export interface Layout {
  house: HouseView;
  setup: SetupView;
}
