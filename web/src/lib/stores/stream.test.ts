import { describe, expect, it, vi } from 'vitest';
import { HouseStore } from './house.svelte';
import { connectStream } from './stream';

class FakeES {
  static all: FakeES[] = [];
  listeners: Record<string, (e: MessageEvent) => void> = {};
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(name: string, fn: (e: MessageEvent) => void) { this.listeners[name] = fn; }
  close() { this.closed = true; }
  emit(name: string, data: unknown) { this.listeners[name]?.({ data: JSON.stringify(data) } as MessageEvent); }
}

const snapshot = {
  house: { rooms: [], radiators: [] }, pending: [], overrides: [],
  status: { connected: true, last_ok_at: 1, last_error: null }
};

function setup() {
  FakeES.all = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = 'visible';
  let clock = 0;
  const store = new HouseStore();
  const stop = connectStream(store, {
    EventSourceImpl: FakeES as unknown as typeof EventSource,
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    cancel: () => {},
    doc: doc as unknown as Document,
    now: () => clock
  });
  return { store, timers, doc, stop, tick: (ms: number) => (clock += ms) };
}

describe('connectStream', () => {
  it('opens, applies the snapshot and the diffs', () => {
    const { store } = setup();
    expect(store.connection).toBe('connecting');
    FakeES.all[0].emit('snapshot', snapshot);
    expect(store.connection).toBe('open');
    FakeES.all[0].emit('status', { connected: false, last_ok_at: 1, last_error: 'QUOTA' });
    expect(store.status.last_error).toBe('QUOTA');
  });

  it('reconnects with exponential backoff', () => {
    const { store, timers } = setup();
    FakeES.all[0].onerror!();
    expect(store.connection).toBe('reconnecting');
    expect(FakeES.all[0].closed).toBe(true);
    expect(timers.at(-1)!.ms).toBe(1000);
    timers.at(-1)!.fn();
    FakeES.all[1].onerror!();
    expect(timers.at(-1)!.ms).toBe(2000);
  });

  it('reconnects immediately when the page becomes visible again', () => {
    const { doc } = setup();
    FakeES.all[0].onerror!();
    expect(FakeES.all).toHaveLength(1);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(FakeES.all).toHaveLength(2);
    FakeES.all[1].emit('snapshot', snapshot);
  });

  it('stops cleanly', () => {
    const { stop, timers } = setup();
    const before = timers.length;
    stop();
    expect(FakeES.all[0].closed).toBe(true);
    FakeES.all[0].onerror?.();
    timers.forEach((t) => t.fn());
    expect(timers).toHaveLength(before);
    expect(FakeES.all).toHaveLength(1);
  });

  it('a silent stream (no event, not even a ping, for 45 s) reconnects', () => {
    const { store, timers } = setup();
    FakeES.all[0].emit('snapshot', snapshot);
    const watchdog = timers.at(-1)!;
    expect(watchdog.ms).toBe(45_000);
    // A ping re-arms the timer: the previous one no longer fires.
    FakeES.all[0].emit('ping', {});
    watchdog.fn();
    expect(FakeES.all[0].closed).toBe(false);
    timers.at(-1)!.fn();
    expect(FakeES.all[0].closed).toBe(true);
    expect(store.connection).toBe('reconnecting');
    timers.at(-1)!.fn();
    expect(FakeES.all).toHaveLength(2);
    FakeES.all[1].emit('snapshot', snapshot);
    expect(store.connection).toBe('open');
  });

  it.each([[11_000, 2], [5_000, 1]])('hidden for %i ms while open -> %i sources', (ms, n) => {
    const { doc, tick } = setup();
    FakeES.all[0].emit('snapshot', snapshot);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    tick(ms);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(FakeES.all).toHaveLength(n);
    if (n === 2) expect(FakeES.all[0].closed).toBe(true);
  });

  it('tells the app about every failure, before reconnecting', () => {
    FakeES.all = [];
    const onError = vi.fn();
    const timers: Array<{ fn: () => void; ms: number }> = [];
    connectStream(new HouseStore(), {
      EventSourceImpl: FakeES as unknown as typeof EventSource,
      schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      cancel: () => {},
      onError
    });
    FakeES.all[0].onerror!();
    expect(onError).toHaveBeenCalledTimes(1);
    timers.at(-1)!.fn();
    FakeES.all[1].onerror!();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('goes to reconnecting the moment the browser goes offline, and reopens when it is back', () => {
    FakeES.all = [];
    const win = new EventTarget();
    const store = new HouseStore();
    const stop = connectStream(store, {
      EventSourceImpl: FakeES as unknown as typeof EventSource,
      schedule: () => 0,
      cancel: () => {},
      doc: new EventTarget() as unknown as Document,
      win: win as unknown as Window
    });
    FakeES.all[0].emit('snapshot', snapshot);
    expect(store.connection).toBe('open');
    win.dispatchEvent(new Event('offline'));
    expect(store.connection).toBe('reconnecting');
    expect(FakeES.all[0].closed).toBe(true);
    win.dispatchEvent(new Event('online'));
    expect(FakeES.all).toHaveLength(2);
    FakeES.all[1].emit('snapshot', snapshot);
    expect(store.connection).toBe('open');
    stop();
  });
});

describe('alerts over the stream', () => {
  it('the snapshot count and the alerts event reach onAlerts', () => {
    FakeES.all = [];
    const seen: unknown[] = [];
    connectStream(new HouseStore(), {
      EventSourceImpl: FakeES as unknown as typeof EventSource,
      schedule: () => 0,
      cancel: () => {},
      doc: new EventTarget() as unknown as Document,
      onAlerts: (s) => seen.push(s)
    });
    const es = FakeES.all[0];
    es.emit('snapshot', { ...snapshot, alerts: { active: 2, highest: 'bad' } });
    es.emit('alerts', { active: 1, highest: 'warn' });
    expect(seen).toEqual([{ active: 2, highest: 'bad' }, { active: 1, highest: 'warn' }]);
  });
});
