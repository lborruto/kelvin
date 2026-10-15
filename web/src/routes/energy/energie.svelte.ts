/**
 * Énergie's data: the selected view and period, the two reports, the Courbe's day and the room.
 *
 * Plan 5's `comparison` pairs each day with its counterpart under the request's `group`, so a
 * Semaine, Mois or Année view needs two reports: the bars (`group` = day or month) and the period
 * itself (`group` = the view). Both carry `period_from`/`period_to`; Jour is a single request.
 * Every request has a sequence number: an answer that is no longer the latest is dropped.
 */
import { api, ApiError } from '$lib/api/client';
import type { EnergyDay, EnergyReport } from '$lib/api/types';
import { addDays, canStep, chartWindow, isLatest, periodOf, stepPeriod, type Span, type View } from '$lib/energy';
import { parisTodayIso } from '$lib/format';
import { errorText, m } from '$lib/i18n';

/** Kelvin's own failures with no more to say than the page's sentence (unreachable, a server error, an empty body). */
const GENERIC = new Set(['network', 'server', 'unexpected']);

/** A coded or detailed failure says what went wrong, in the active language; a bare one (`Error`, Kelvin unreachable,
 * a server error, a body with neither code nor detail) gets the page's own sentence. A thunk: the line re-renders on a
 * language switch. */
export function failure(e: unknown, generic: () => string): () => string {
  return () => (e instanceof ApiError && !GENERIC.has(e.code ?? '') && (e.code || e.message) ? errorText(e) : generic());
}

export interface Loaded {
  view: View;
  period: Span;
  /** The bars: day buckets (Jour, Semaine, Mois) or month buckets (Année). */
  chart: EnergyReport;
  /** The period: hero, panels, comparisons, CSV. The same object as `chart` in Jour. */
  main: EnergyReport;
}

const earliest = (...days: (string | null | undefined)[]) => days.filter((d): d is string => !!d).sort()[0] ?? null;

export class EnergieData {
  view = $state<View>('month');
  period = $state<Span | null>(null);
  /** The last day with Linky data (else yesterday): the default period holds it and `›` stops there. */
  last = $state<string | null>(null);
  /** The first day with any data, Linky or radiators: `‹` stops there. */
  first = $state<string | null>(null);
  data = $state<Loaded | null>(null);
  loading = $state(false);
  /** What went wrong, read at render time (a thunk), so a line already on screen follows a language switch. */
  error = $state<(() => string) | null>(null);
  dayIso = $state<string | null>(null);
  day = $state<EnergyDay | null>(null);
  dayError = $state<(() => string) | null>(null);
  /** Days with a complete curve, kept from the last answer so stepping still works after a failure. */
  available = $state<string[]>([]);
  room = $state<string | null>(null);
  /** The view and period whose report failed while another stayed on screen: « Réessayer » asks for it again. */
  failed = $state<{ view: View; period: Span } | null>(null);
  private seq = 0;
  /** The Courbe's day was picked by the page (L9), not by the user: an incomplete answer still falls back to an
   * older complete day, even when the same day is asked again meanwhile (a room change, a retry). */
  private autoDay = false;
  /** `last` came from Linky; without it, it is yesterday and moves at midnight. */
  private linkyLast = false;
  private daySeq = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get canPrev(): boolean {
    return !!this.period && canStep(this.view, this.period, -1, this.first, this.last);
  }
  get canNext(): boolean {
    return !!this.period && canStep(this.view, this.period, 1, this.first, this.last);
  }
  get latest(): boolean {
    return !this.period || isLatest(this.period, this.last);
  }
  /** Complete curve days inside the period: the Courbe's own ‹ › walk through them. */
  get dayChoices(): string[] {
    const p = this.period;
    return p ? this.available.filter((d) => d >= p.from && d < p.to) : [];
  }
  get canPrevDay(): boolean {
    const cur = this.dayIso;
    return !!cur && this.dayChoices.some((d) => d < cur);
  }
  get canNextDay(): boolean {
    const cur = this.dayIso;
    return !!cur && this.dayChoices.some((d) => d > cur);
  }

  /** First load, once the Linky status is known (`last_day`, or null without Linky). */
  start(lastDay: string | null): void {
    this.linkyLast = !!lastDay;
    this.last = lastDay ?? addDays(parisTodayIso(this.now()), -1);
    this.period = periodOf(this.view, this.last);
    void this.load();
  }

  /** Midnight in Paris with the page open: « yesterday » moved, so the period on screen is asked again (its radiators
   * count up to yesterday, a running period grows by a day). Without a Linky day the last day is yesterday and moves with
   * it; a page on the latest period follows it to the new one. */
  newDay(): void {
    if (!this.period) return;
    const wasLatest = this.latest;
    if (!this.linkyLast) this.last = addDays(parisTodayIso(this.now()), -1);
    if (wasLatest && this.last) this.period = periodOf(this.view, this.last);
    void this.load();
  }

  /** Another view keeps the day in focus: the Courbe's day when it is in the period, else the period's last day with data. */
  setView(v: View): void {
    if (v === this.view) return;
    const keep = this.period ? this.focusDay(this.period) : this.last;
    this.view = v;
    if (!keep) return;
    this.period = periodOf(v, keep);
    void this.load();
  }

  step(delta: -1 | 1): void {
    if (!this.period || !(delta < 0 ? this.canPrev : this.canNext)) return;
    this.period = stepPeriod(this.view, this.period, delta);
    void this.load();
  }

  toLatest(): void {
    if (!this.last) return;
    this.period = periodOf(this.view, this.last);
    void this.load();
  }

  retry(): void {
    if (this.failed) {
      this.view = this.failed.view;
      this.period = this.failed.period;
    }
    if (this.period) void this.load();
  }

  /** Enter on a bar, or its inspector's action: a month opens Mois, a day opens its Courbe (its Jour in Jour). */
  drill(key: string): void {
    const group = this.data?.chart.group;
    if (group === 'month') {
      this.view = 'month';
      this.period = periodOf('month', `${key}-01`);
      void this.load();
    } else if (group === 'day' && this.view === 'day') {
      this.period = periodOf('day', key);
      void this.load();
    } else if (group === 'day') {
      this.showDay(key);
    }
  }

  showDay(iso: string, auto = false): void {
    this.dayIso = iso;
    this.autoDay = auto;
    void this.loadDay();
  }

  stepDay(delta: -1 | 1): void {
    const cur = this.dayIso;
    if (!cur) return;
    const list = this.dayChoices;
    const next = delta < 0 ? list.filter((d) => d < cur).at(-1) : list.find((d) => d > cur);
    if (next) this.showDay(next);
  }

  setRoom(id: string | null): void {
    if (id === this.room) return;
    this.room = id;
    if (this.dayIso) void this.loadDay();
  }

  retryDay(): void {
    if (this.dayIso) void this.loadDay();
  }

  private focusDay(p: Span): string {
    if (this.dayIso && this.dayIso >= p.from && this.dayIso < p.to) return this.dayIso;
    return this.lastIn(p);
  }

  /** The period's last day that can have data. */
  private lastIn(p: Span): string {
    const end = addDays(p.to, -1);
    if (!this.last || this.last >= end) return end;
    return this.last >= p.from ? this.last : p.from;
  }

  private async load(): Promise<void> {
    const v = this.view;
    const p = this.period!;
    const mine = ++this.seq;
    // The previous report stays on screen, dimmed (aria-busy), until the new one arrives.
    this.loading = true;
    this.error = null;
    const w = chartWindow(v, p);
    try {
      const chartReq = api.energyReport(w.from, w.to, w.group, p);
      const mainReq = v === 'day' ? chartReq : api.energyReport(p.from, p.to, v, p);
      const [chart, main] = await Promise.all([chartReq, mainReq]);
      if (mine !== this.seq) return;
      this.data = { view: v, period: p, chart, main };
      this.failed = null;
      this.loading = false;
      // The report knows the last Linky day even when the status call failed: it holds across midnight.
      if (main.last_day) {
        this.last = main.last_day;
        this.linkyLast = true;
      }
      this.first = earliest(main.linky_since, main.quality?.radiators_since);
      if (main.linky) this.pickDay(v, p);
    } catch (e) {
      if (mine !== this.seq) return;
      this.error = failure(e, () => m.energyData.reportFailed);
      this.loading = false;
      // The navigator, the hero and the panels must describe the same period: go back to the one on screen.
      const shown = this.data;
      if (shown && (shown.view !== v || shown.period !== p)) {
        this.failed = { view: v, period: p };
        this.view = shown.view;
        this.period = shown.period;
      }
    }
  }

  /** Jour shows its own day; other views keep the user's day if it is in the period, else open on
   * the newest complete day of the period (L9), else the period's last day with data. */
  private pickDay(v: View, p: Span): void {
    if (v === 'day') {
      if (this.dayIso !== p.from) this.showDay(p.from);
      return;
    }
    if (this.dayIso && this.dayIso >= p.from && this.dayIso < p.to) return;
    this.showDay(this.dayChoices.at(-1) ?? this.lastIn(p), true);
  }

  private async loadDay(): Promise<void> {
    const d = this.dayIso!;
    const mine = ++this.daySeq;
    // Another day: its heading must never sit over the previous day's bars. The same day (a room
    // change) stays on screen until the new answer arrives.
    if (this.day?.date !== d) this.day = null;
    this.dayError = null;
    try {
      const r = await api.energyDay(d, this.room);
      if (mine !== this.daySeq) return;
      this.available = r.available;
      const auto = this.autoDay;
      this.autoDay = false;
      if (auto && !r.complete) {
        const p = this.period;
        const older = r.available.filter((x) => x < d && (!p || x >= p.from)).at(-1);
        if (older) {
          this.dayIso = older;
          void this.loadDay();
          return;
        }
      }
      this.day = r;
    } catch (e) {
      if (mine === this.daySeq) this.dayError = failure(e, () => m.energyData.dayFailed);
    }
  }
}
