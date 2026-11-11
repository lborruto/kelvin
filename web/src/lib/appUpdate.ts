/** Kelvin's own updates (the service worker and the shell it caches).
 *
 * A tab left open, or the installed app, would keep the old shell after an upgrade: a new version is looked for
 * when the tab comes back and every hour, not only at page load. And a new version never reloads the page under
 * the owner's finger: it waits (`registerType: 'prompt'`) until the page is hidden, or until the owner taps
 * « Mettre à jour » on the toast that offers it; never while a setpoint waits to be sent, a command is in flight or
 * edits are unsent. */
import { reloadHeld, sending } from './busy';
import { m } from './i18n';
import { draftWaiting } from './sendDraft.svelte';
import { toasts } from './stores/toasts.svelte';

/** A tab that stays open asks once an hour. */
export const CHECK_EVERY_MS = 3_600_000;
/** Coming back to the tab asks at once, but not twice within a minute. */
export const CHECK_MIN_GAP_MS = 60_000;
/** The offer stays longer than an information toast: it is a choice, not a notice. */
export const OFFER_MS = 20_000;
/** After « Mettre à jour », how often to look whether the page is free. */
const RETRY_MS = 500;

/** Whether to ask the server for a new service worker now (`last`: the previous ask, null before the first). */
export function shouldCheck(now: number, last: number | null, s: { visible: boolean; online: boolean }): boolean {
  if (!s.visible || !s.online) return false;
  return last === null || now - last >= CHECK_MIN_GAP_MS;
}

/** `waiting`: a new version is installed and waits; `activated`: it took control, this page is the old shell. */
export type UpdateStage = 'none' | 'waiting' | 'activated';
export interface PageState {
  hidden: boolean;
  /** A setpoint waits to be sent, a command is in flight or edits are unsent. */
  busy: boolean;
  /** The owner tapped « Mettre à jour ». */
  asked: boolean;
}

/** `apply`: let the new version take control; `reload`: load it; `offer`: say it is there; `none`: wait. */
export function nextStep(stage: UpdateStage, s: PageState): 'none' | 'offer' | 'apply' | 'reload' {
  if (stage === 'none') return 'none';
  if (s.hidden || s.asked) {
    if (s.busy) return 'none';
    return stage === 'waiting' ? 'apply' : 'reload';
  }
  return 'offer';
}

export interface UpdaterIO {
  /** Let the waiting service worker take control. */
  apply: () => void;
  reload: () => void;
  /** Tell the owner a new version is there. */
  offer: () => void;
  hidden: () => boolean;
  busy: () => boolean;
}

export class AppUpdater {
  #io: UpdaterIO;
  #stage: UpdateStage = 'none';
  #asked = false;
  #offered = false;
  #applied = false;
  #retry: ReturnType<typeof setTimeout> | undefined;

  constructor(io: UpdaterIO) {
    this.#io = io;
  }

  /** A new version is installed and waits. */
  needRefresh(): void {
    if (this.#stage === 'none') this.#stage = 'waiting';
    this.#step();
  }

  /** The new version took control (asked here, or by another tab). */
  needReload(): void {
    this.#stage = 'activated';
    this.#step();
  }

  /** The page was hidden or shown. */
  visibility(): void {
    this.#step();
  }

  /** « Mettre à jour ». */
  ask(): void {
    this.#asked = true;
    this.#step();
  }

  stop(): void {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#stage = 'none';
  }

  #step(): void {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const step = nextStep(this.#stage, { hidden: this.#io.hidden(), busy: this.#io.busy(), asked: this.#asked });
    if (step === 'offer') {
      if (this.#offered) return;
      this.#offered = true;
      this.#io.offer();
    } else if (step === 'apply') {
      if (this.#applied) return;
      this.#applied = true;
      this.#io.apply();
    } else if (step === 'reload') {
      this.#stage = 'none';
      this.#io.reload();
    } else if (this.#stage !== 'none' && this.#asked) {
      // Asked while busy: as soon as the send is over. (A hidden page is looked at again when it hides anew.)
      this.#retry = setTimeout(() => this.#step(), RETRY_MS);
    }
  }
}

/** The part of `virtual:pwa-register` used here (vite-plugin-pwa 1.x). */
type RegisterSW = (options: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

/** Register the service worker and keep it up to date; returns the way to stop. */
export function startAppUpdates(registerSW: RegisterSW): () => void {
  let registration: ServiceWorkerRegistration | undefined;
  let last: number | null = null;
  const check = () => {
    const now = Date.now();
    if (!registration || !shouldCheck(now, last, { visible: document.visibilityState === 'visible', online: navigator.onLine !== false })) return;
    last = now;
    // Offline or Kelvin restarting: the next return or the next hour asks again.
    registration.update().catch(() => {});
  };
  const up = new AppUpdater({
    apply: () => void update(),
    reload: () => location.reload(),
    offer: () => toasts.push(() => m.appUpdate.ready, 'info', OFFER_MS, { label: () => m.appUpdate.apply, run: () => up.ask() }),
    hidden: () => document.visibilityState === 'hidden',
    busy: () => draftWaiting() || sending() || reloadHeld()
  });
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => up.needRefresh(),
    onNeedReload: () => up.needReload(),
    onRegisteredSW: (_url, r) => {
      registration = r;
      // The page load already asked.
      last = Date.now();
    }
  });
  const seen = () => {
    up.visibility();
    check();
  };
  document.addEventListener('visibilitychange', seen);
  const timer = setInterval(check, CHECK_EVERY_MS);
  return () => {
    document.removeEventListener('visibilitychange', seen);
    clearInterval(timer);
    up.stop();
  };
}
