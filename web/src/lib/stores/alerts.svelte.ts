import { api } from '$lib/api/client';
import type { Alert, AlertSummary } from '$lib/api/types';

/** The active alerts (spec §2.4). The SSE `alerts` count says when to reload the list. */
export class AlertsStore {
  list = $state<Alert[] | null>(null);
  /** The last load failed: the UI says so (with a retry) instead of « Aucune alerte. ». */
  error = $state(false);

  /** The list came in, or its load failed: a page that waits on the alerts can draw (re-review). */
  get answered(): boolean {
    return this.list !== null || this.error;
  }

  /** Load once on first need; after a failure only the « Réessayer » button loads again. */
  get due(): boolean {
    return this.list === null && !this.error;
  }
  summary = $state<AlertSummary>({ active: 0, highest: null });
  #gen = 0;

  async load(): Promise<void> {
    const gen = this.#gen;
    try {
      const got = await api.alerts('active');
      if (gen === this.#gen) {
        this.list = got;
        this.error = false;
      }
    } catch {
      if (gen === this.#gen) this.error = true; // the last list (or none) stays: never an empty one
    }
  }

  applySummary(s: AlertSummary | undefined): void {
    if (!s) return;
    const changed = s.active !== this.summary.active || s.highest !== this.summary.highest || this.list === null;
    this.summary = s;
    if (changed) void this.load();
  }

  async dismiss(id: number): Promise<void> {
    this.list = (this.list ?? []).filter((a) => a.id !== id);
    try {
      await api.dismissAlert(id);
    } catch {
      void this.load(); // the server is the truth: show it again if it is still active
    }
  }

  of(kinds: string[], filter: (a: Alert) => boolean = () => true): Alert[] {
    return (this.list ?? []).filter((a) => kinds.includes(a.kind) && filter(a));
  }

  reset(): void {
    this.#gen++;
    this.list = null;
    this.error = false;
    this.summary = { active: 0, highest: null };
  }
}

export const alerts = new AlertsStore();
