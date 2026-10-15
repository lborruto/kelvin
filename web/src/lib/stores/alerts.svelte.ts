import { api } from '$lib/api/client';
import type { Alert, AlertSummary } from '$lib/api/types';

/** The active alerts (spec §2.4). The SSE `alerts` count says when to reload the list. */
export class AlertsStore {
  list = $state<Alert[] | null>(null);
  summary = $state<AlertSummary>({ active: 0, highest: null });
  #gen = 0;

  async load(): Promise<void> {
    const gen = this.#gen;
    try {
      const got = await api.alerts('active');
      if (gen === this.#gen) this.list = got;
    } catch {
      if (gen === this.#gen && this.list === null) this.list = [];
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
    this.summary = { active: 0, highest: null };
  }
}

export const alerts = new AlertsStore();
