import type { Expected, HouseView, Override, Pending, Radiator, Room, Snapshot, Status } from '$lib/api/types';
import { announcer } from './announcer.svelte';
import { toasts } from './toasts.svelte';

type Scheduler = (fn: () => void, ms: number) => unknown;
const ACTIVE = new Set(['sending', 'pending']);
const CONFIRMED_LINGER_MS = 1500;
export const LOST_ERROR = 'Commande non confirmée (connexion perdue).';
export const UNKNOWN_ERROR = 'Résultat inconnu (connexion perdue) — vérifiez.';

/** True when `next` re-sends what `failed` tried: same radiators (or more) and every value it set. */
function covers(next: Pending, failed: Pending): boolean {
  if (next.created_at < failed.created_at) return false;
  const ids = new Set(next.radiator_ids);
  if (!failed.radiator_ids.every((i) => ids.has(i))) return false;
  const exp = Object.entries(failed.expected ?? {});
  // Nothing observable to compare (programme, toggles…): only the same command retires it.
  if (!exp.length) return !Object.keys(next.expected ?? {}).length && next.label === failed.label;
  return exp.every(([rid, e]) => Object.keys(e).every((k) => next.expected?.[rid]?.[k as keyof Expected] !== undefined));
}

export class HouseStore {
  rooms = $state<Room[]>([]);
  radiators = $state<Record<string, Radiator>>({});
  pending = $state<Record<string, Pending>>({});
  overrides = $state<Override[]>([]);
  status = $state<Status>({ connected: false, last_ok_at: null, last_error: null });
  connection = $state<'connecting' | 'open' | 'reconnecting'>('connecting');
  loaded = $state(false);
  /** The last house-wide command (Tout éteindre, Tout remettre en programme), shown by every HouseActions. */
  houseCommandId = $state<string | null>(null);
  schedule: Scheduler;
  /** Commands sent from this browser: their progress is announced to screen readers. */
  private watched = new Set<string>();

  constructor(schedule: Scheduler = (fn, ms) => setTimeout(fn, ms)) {
    this.schedule = schedule;
  }

  /** Drop everything the browser holds about the home (logout, session lost). */
  reset(): void {
    this.rooms = [];
    this.radiators = {};
    this.pending = {};
    this.overrides = [];
    this.status = { connected: false, last_ok_at: null, last_error: null };
    this.connection = 'connecting';
    this.loaded = false;
    this.houseCommandId = null;
    this.watched.clear();
  }

  /** True when commands can be sent and their answer will arrive: the stream is up, or a loaded
   * house is only refreshing it (a phone back from the background), whose snapshot answers any
   * command sent meanwhile. False while reconnecting after a failure (the banner says so). */
  get online(): boolean {
    return this.connection === 'open' || (this.connection === 'connecting' && this.loaded);
  }

  /** Announce the progress of a command sent from here (Envoi…, Confirmé, the failure). */
  watch(id: string): void {
    this.watched.add(id);
  }

  private announce(prev: Pending | undefined, next: Pending): void {
    if (!this.watched.has(next.id)) return;
    const was = prev ? (ACTIVE.has(prev.status) ? 'active' : prev.status) : null;
    const now = ACTIVE.has(next.status) ? 'active' : next.status;
    if (was === now) return;
    if (now === 'active') announcer.say(`${next.label} — envoi…`);
    else if (now === 'confirmed') announcer.say(`${next.label} — confirmé`);
    else if (now === 'failed') announcer.say(`${next.label} — ${next.error ?? 'échec de la commande.'}`, true);
    if (now !== 'active') this.watched.delete(next.id);
  }

  applySnapshot(s: Snapshot): void {
    const local = Object.values(this.pending);
    this.applyHouseView(s.house);
    const recent = new Map((s.recent ?? []).map((p) => [p.id, p]));
    const next: Record<string, Pending> = {};
    const unknown: Pending[] = [];
    for (const p of local) {
      if (p.status === 'failed') next[p.id] = p;
      else if (!ACTIVE.has(p.status) || s.pending.some((q) => q.id === p.id)) continue;
      else if (recent.has(p.id)) {
        // The server knows how it ended: use that, not a guess.
        const r = recent.get(p.id)!;
        if (r.status === 'failed') next[p.id] = r;
        else if (r.status === 'confirmed') {
          next[p.id] = r;
          this.lingerThenDrop(r.id);
        }
      } else if (!Object.keys(p.expected ?? {}).length) {
        // No state to check it against (programme, toggles…): never report it as done.
        next[p.id] = { ...p, status: 'failed', error: UNKNOWN_ERROR };
        unknown.push(p);
      } else if (!this.matchesState(p)) {
        next[p.id] = { ...p, status: 'failed', error: LOST_ERROR };
      }
    }
    for (const p of s.pending) next[p.id] = p;
    for (const p of s.pending) if (ACTIVE.has(p.status)) this.retireCovered(next, p);
    const before = this.pending;
    for (const p of Object.values(next)) this.announce(before[p.id], p);
    this.pending = next;
    this.overrides = s.overrides;
    this.status = s.status;
    this.loaded = true;
    // A snapshot only ever arrives over an open stream.
    this.connection = 'open';
    for (const p of unknown) toasts.push(`${p.label} : résultat inconnu — vérifiez.`);
  }

  /** True when every expected value of the pending is already what the radiators report (never for none). */
  private matchesState(p: Pending): boolean {
    const entries = Object.entries(p.expected ?? {});
    return (
      entries.length > 0 &&
      entries.every(([id, exp]) => {
        const r = this.radiators[id];
        if (!r) return false;
        return (['mode', 'target', 'comfort', 'eco_delta'] as const).every(
          (k) => exp[k] === undefined || exp[k] === r[k]
        );
      })
    );
  }

  /** A newer command re-sending what a failed one tried makes that failure history: drop it. */
  private retireCovered(map: Record<string, Pending>, p: Pending): void {
    for (const f of Object.values(map)) {
      if (f.id !== p.id && f.status === 'failed' && covers(p, f)) delete map[f.id];
    }
  }

  private lingerThenDrop(id: string): void {
    this.schedule(() => {
      if (this.pending[id]?.status === 'confirmed') delete this.pending[id];
    }, CONFIRMED_LINGER_MS);
  }

  private applyHouseView(h: HouseView): void {
    this.rooms = h.rooms;
    this.radiators = Object.fromEntries(h.radiators.map((r) => [r.id, r]));
  }

  applyHouse(d: HouseView): void {
    for (const r of d.radiators) this.radiators[r.id] = r;
    if (d.rooms.length) {
      const byId = new Map(d.rooms.map((r) => [r.id, r]));
      this.rooms = this.rooms.map((r) => byId.get(r.id) ?? r);
    }
  }

  applyPending(p: Pending): void {
    if (p.status === 'superseded') {
      delete this.pending[p.id];
      return;
    }
    const prev = this.pending[p.id];
    if (prev && !ACTIVE.has(prev.status) && ACTIVE.has(p.status)) return;
    this.announce(prev, p);
    this.pending[p.id] = p;
    if (!prev && ACTIVE.has(p.status)) this.retireCovered(this.pending, p);
    if (p.status === 'confirmed') this.lingerThenDrop(p.id);
  }

  dismiss(id: string): void {
    delete this.pending[id];
  }

  applyOverrides(list: Override[]): void {
    this.overrides = list;
  }

  applyStatus(s: Status): void {
    this.status = s;
  }

  room(id: string): Room | undefined {
    return this.rooms.find((r) => r.id === id);
  }

  roomRadiators(id: string): Radiator[] {
    const room = this.room(id);
    return room ? room.radiator_ids.map((i) => this.radiators[i]).filter(Boolean) : [];
  }

  /** The most recent pending (active, confirmed or failed) touching any of these radiators. */
  pendingFor(radiatorIds: string[]): Pending | undefined {
    const ids = new Set(radiatorIds);
    return Object.values(this.pending)
      .filter((p) => p.radiator_ids.some((i) => ids.has(i)))
      .sort((a, b) => b.created_at - a.created_at)[0];
  }

  get houseCommand(): Pending | undefined {
    return this.houseCommandId ? this.pending[this.houseCommandId] : undefined;
  }

  expectedFor(radiatorId: string): Expected {
    const out: Expected = {};
    Object.values(this.pending)
      .filter((p) => ACTIVE.has(p.status) && p.expected?.[radiatorId])
      .sort((a, b) => a.created_at - b.created_at)
      .forEach((p) => Object.assign(out, p.expected[radiatorId]));
    return out;
  }

  /** Expected values shared by every radiator of the room (a key differing between radiators is dropped). */
  roomExpected(roomId: string): Expected {
    const per = this.roomRadiators(roomId).map((r) => this.expectedFor(r.id));
    if (!per.length) return {};
    const out: Expected = {};
    for (const key of ['mode', 'target', 'comfort', 'eco_delta'] as const) {
      const values = per.map((e) => e[key]);
      if (values.every((v) => v !== undefined && v === values[0])) Object.assign(out, { [key]: values[0] });
    }
    return out;
  }

  overrideFor(roomId: string): Override | undefined {
    const ids = new Set(this.room(roomId)?.radiator_ids ?? []);
    return (
      this.overrides.find((o) => o.kind === 'boost' && o.room_id === roomId) ??
      this.overrides.find((o) => o.radiator_ids.some((i) => ids.has(i)))
    );
  }

  /** The room to show first: the first one needing attention (open window, command in flight, override), else the first. */
  get defaultRoomId(): string | null {
    const active = Object.values(this.pending).filter((p) => ACTIVE.has(p.status));
    const needs = (r: Room) =>
      r.window_open ||
      !!this.overrideFor(r.id) ||
      active.some((p) => p.radiator_ids.some((i) => r.radiator_ids.includes(i)));
    return (this.rooms.find(needs) ?? this.rooms[0])?.id ?? null;
  }

  get away(): Override | undefined {
    return this.overrides.find((o) => o.kind === 'away');
  }

  get heatingCount(): number {
    return this.rooms.filter((r) => this.roomRadiators(r.id).some((x) => (x.working_rate ?? 0) > 0)).length;
  }
}

export const house = new HouseStore();
