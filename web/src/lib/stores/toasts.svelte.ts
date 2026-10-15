export interface Toast {
  id: number;
  /** A thunk: the toast reads its text at render, so a language switch re-renders it. */
  text: () => string;
  kind: 'error' | 'info';
  action?: ToastAction;
}

export interface ToastAction {
  label: () => string;
  run: () => void;
}

let seq = 0;
/** Errors stay long enough to be read twice (WCAG 2.2.1); info leaves sooner. */
export const TTL = { error: 10_000, info: 6000 } as const;

class Toasts {
  items = $state<Toast[]>([]);
  #timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; left: number; since: number }>();

  push(message: string | (() => string), kind: Toast['kind'] = 'error', ttlMs: number = TTL[kind], action?: ToastAction): void {
    const id = ++seq;
    const text = typeof message === 'function' ? message : () => message;
    this.items = [...this.items, { id, text, kind, action }];
    this.#timers.set(id, { handle: null, left: ttlMs, since: 0 });
    this.resume(id);
  }

  /** Hovered or focused: the toast waits for the reader. */
  pause(id: number): void {
    const t = this.#timers.get(id);
    if (!t?.handle) return;
    clearTimeout(t.handle);
    t.handle = null;
    t.left = Math.max(1000, t.left - (Date.now() - t.since));
  }

  resume(id: number): void {
    const t = this.#timers.get(id);
    if (!t || t.handle) return;
    t.since = Date.now();
    t.handle = setTimeout(() => this.remove(id), t.left);
  }

  remove(id: number): void {
    const t = this.#timers.get(id);
    if (t?.handle) clearTimeout(t.handle);
    this.#timers.delete(id);
    this.items = this.items.filter((x) => x.id !== id);
  }
}

export const toasts = new Toasts();
