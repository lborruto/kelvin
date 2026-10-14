export type Mode = 'off' | 'manual' | 'program' | 'other';
export type RoomMode = Mode | 'mixed';
export type SettableMode = 'off' | 'manual' | 'program';
export type SetpointKind = 'manual' | 'comfort' | 'eco';
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = (typeof DAYS)[number];

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
}

export interface Room {
  id: string;
  name: string;
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
}

export interface Expected {
  mode?: Mode;
  target?: number;
  comfort?: number;
  eco_delta?: number;
}

export type PendingStatus = 'sending' | 'pending' | 'confirmed' | 'failed' | 'superseded';
export interface Pending {
  id: string;
  label: string;
  radiator_ids: string[];
  status: PendingStatus;
  error: string | null;
  created_at: number;
  expected: Record<string, Expected>;
}

export interface Override {
  id: string;
  kind: 'boost' | 'away';
  room_id: string | null;
  radiator_ids: string[];
  temperature: number;
  ends_at: number;
  restoring: boolean;
}

export interface Status {
  connected: boolean;
  last_ok_at: number | null;
  last_error: string | null;
  auth_rejected?: boolean;
}

export interface HouseView {
  rooms: Room[];
  radiators: Radiator[];
}

export interface Snapshot {
  house: HouseView;
  pending: Pending[];
  /** Commands settled in the last minutes: the real outcome for a client that missed it. */
  recent?: Pending[];
  overrides: Override[];
  status: Status;
}

export interface HistoryPoint {
  radiator_id: string;
  ts: number;
  temperature: number | null;
  setpoint: number | null;
  target: number | null;
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
}
export interface PriceEntry {
  valid_from: string;
  subscription_eur_month: number;
  hc_eur_kwh: number;
  hp_eur_kwh: number;
}
export interface Tariff {
  option: 'hchp';
  kva: number;
  hc_slots: Slot[];
  prices: PriceEntry[];
}
export interface SettingsView {
  tariff: Tariff | null;
  /** From the Enedis contract (subscribed power, off-peak hours); prefills the form. */
  prefill: { kva: number | null; hc_slots: Slot[] } | null;
}
export interface TariffInput {
  option: 'hchp';
  kva: number;
  hc_slots: Slot[];
  subscription_eur_month: number;
  hc_eur_kwh: number;
  hp_eur_kwh: number;
  valid_from: string;
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
export interface EnergySummary {
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
}
export interface EnergyReportBucket extends EnergySummary {
  key: string;
}
export interface PeriodSummary extends EnergySummary {
  from: string;
  to: string;
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
  slot_share: number;
  avg_price: number | null;
  /** P_hp − P_hc at today's prices. */
  delta_price: number;
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
  hero: { current: PeriodSummary; previous: PeriodSummary };
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
  /** An HC slot edge falls inside a half-hour: those half-hours' HC share is prorated (L11). */
  boundary_prorated: boolean;
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
  /** A day before `counted_from`: no intervals, `totals` and `power` all null. */
  not_counted: 'before_first_day' | null;
  room: {
    id: string;
    name: string;
    samples: RoomSample[];
    overrides: { id: string; kind: string; temperature: number | null; ends_at: number | null }[];
  } | null;
}
export interface CurvePointView {
  ts: number;
  minutes: number;
  wh: number;
  /** Share of the interval inside the HC slots, 0…1. */
  offpeak: number;
}
export interface CurveDay {
  date: string;
  points: CurvePointView[];
  kwh: number | null;
  hc_kwh: number | null;
  hp_kwh: number | null;
  complete: boolean;
  available: string[];
}
