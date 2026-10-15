import type { AlertSummary, GridView } from '$lib/api/types';
import { alerts } from './alerts.svelte';
import { grid } from './grid.svelte';
import type { HouseStore } from './house.svelte';

export interface StreamOptions {
  /** Called on every stream failure (the session may have ended: the app re-checks /api/auth/me). */
  onError?: () => void;
  url?: string;
  EventSourceImpl?: typeof EventSource;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  doc?: Document;
  /** Where `online`/`offline` events come from (the window). */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  staleAfterMs?: number;
  /** Reconnect when nothing (not even the server's 15 s ping) arrived for this long. */
  livenessMs?: number;
  /** The alerts count (snapshot and `alerts` event). */
  onAlerts?: (s: AlertSummary) => void;
  /** Tempo and EcoWatt (snapshot and `grid` event). */
  onGrid?: (v: GridView | null) => void;
}

const MAX_DELAY_MS = 30_000;

export function connectStream(store: HouseStore, opts: StreamOptions = {}): () => void {
  const url = opts.url ?? '/api/stream';
  const ES = opts.EventSourceImpl ?? EventSource;
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = opts.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const doc = opts.doc ?? (typeof document === 'undefined' ? undefined : document);
  const win = opts.win ?? (typeof window === 'undefined' ? undefined : window);

  const onAlerts = opts.onAlerts ?? ((s: AlertSummary) => alerts.applySummary(s));
  const onGrid = opts.onGrid ?? ((v: GridView | null) => grid.apply(v));
  const now = opts.now ?? (() => Date.now());
  const staleAfterMs = opts.staleAfterMs ?? 10_000;
  let hiddenAt: number | null = null;
  let es: EventSource | null = null;
  let attempts = 0;
  let timer: unknown = null;
  let closed = false;
  const livenessMs = opts.livenessMs ?? 45_000;
  let watchdog: { handle: unknown } | null = null;

  /** (Re)start the liveness timer: a half-open stream stays 'open' forever unless we notice the silence. */
  function arm(source: EventSource) {
    disarm();
    const w: { handle: unknown } = { handle: null };
    watchdog = w;
    w.handle = schedule(() => {
      if (watchdog !== w) return;
      watchdog = null;
      if (es === source && !closed) fail(source);
    }, livenessMs);
  }
  function disarm() {
    if (watchdog) cancel(watchdog.handle);
    watchdog = null;
  }

  function listen(source: EventSource, name: string, apply: (data: never) => void) {
    source.addEventListener(name, (e) => {
      if (es === source) arm(source);
      apply(JSON.parse((e as MessageEvent).data) as never);
    });
  }

  function fail(source: EventSource) {
    source.close();
    if (es === source) {
      es = null;
      disarm();
    }
    if (closed) return;
    opts.onError?.();
    store.connection = 'reconnecting';
    if (timer) cancel(timer);
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempts);
    attempts += 1;
    timer = schedule(open, delay);
  }

  function open() {
    timer = null;
    if (closed) return;
    es?.close();
    const source = new ES(url);
    es = source;
    store.connection = attempts === 0 ? 'connecting' : 'reconnecting';
    listen(source, 'snapshot', (d: { alerts?: AlertSummary; grid?: GridView | null }) => {
      store.applySnapshot(d as never);
      if (d.alerts) onAlerts(d.alerts);
      if ('grid' in d) onGrid(d.grid ?? null);
      store.connection = 'open';
      attempts = 0;
    });
    listen(source, 'grid', (d: GridView) => onGrid(d));
    listen(source, 'house', (d) => store.applyHouse(d));
    listen(source, 'pending', (d) => store.applyPending(d));
    listen(source, 'layout', (d) => store.applyLayout(d));
    listen(source, 'overrides', (d) => store.applyOverrides(d));
    listen(source, 'status', (d) => store.applyStatus(d));
    listen(source, 'alerts', (d: AlertSummary) => onAlerts(d));
    listen(source, 'ping', () => {});
    source.onerror = () => fail(source);
    arm(source);
  }

  function onVisibility() {
    if (closed) return;
    if (doc?.visibilityState === 'hidden') {
      hiddenAt ??= now();
      return;
    }
    if (doc?.visibilityState !== 'visible') return;
    const wasHiddenFor = hiddenAt === null ? 0 : now() - hiddenAt;
    hiddenAt = null;
    // Mobile browsers kill SSE silently: after a long background, always take a fresh snapshot.
    const stale = wasHiddenFor >= staleAfterMs;
    if (store.connection === 'open' && !stale) return;
    if (timer) cancel(timer);
    attempts = 0;
    open();
  }

  // The browser knows at once when the network is gone; the liveness timer would take 45 s.
  function onOffline() {
    if (closed) return;
    es?.close();
    es = null;
    disarm();
    store.connection = 'reconnecting';
    // Should no « online » follow (some VPN and captive-portal transitions), keep trying slowly.
    if (timer) cancel(timer);
    timer = schedule(open, MAX_DELAY_MS);
  }
  function onOnline() {
    if (closed) return;
    if (timer) cancel(timer);
    attempts = 0;
    open();
  }

  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('offline', onOffline);
  win?.addEventListener('online', onOnline);
  open();

  return () => {
    closed = true;
    if (timer) cancel(timer);
    disarm();
    es?.close();
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('offline', onOffline);
    win?.removeEventListener('online', onOnline);
  };
}
