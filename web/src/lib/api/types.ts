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
export type EnergyGroup = 'day' | 'month' | 'year';
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
}
export interface EnergyReportBucket extends EnergySummary {
  key: string;
}
export interface PeriodSummary extends EnergySummary {
  from: string;
  to: string;
}
export type ProjectionMethod = 'seasonal' | 'linear';
export interface Projection {
  month: { key: string; kwh: number; eur: number | null; actual_kwh: number | null; actual_eur: number | null; method: ProjectionMethod };
  year: {
    from: string;
    to: string;
    kwh: number;
    eur: number | null;
    method: ProjectionMethod | 'mixed';
    months: { key: string; kwh: number; eur: number | null; method: ProjectionMethod }[];
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
  /** First day Linky returned data for. */
  linky_since: string | null;
  radiators: { radiator_id: string; kwh: number }[];
  projection: Projection | null;
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
