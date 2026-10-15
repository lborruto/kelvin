import { api } from '$lib/api/client';
import type { GridView } from '$lib/api/types';

/** Tempo and EcoWatt for the strip (spec §5.1 QW1). The snapshot and the SSE `grid` event keep it current. */
export class GridStore {
  view = $state<GridView | null>(null);
  #gen = 0;

  apply(v: GridView | null | undefined): void {
    if (v !== undefined) this.view = v;
  }

  async load(): Promise<void> {
    const gen = this.#gen;
    try {
      const v = await api.grid();
      if (gen === this.#gen) this.view = v;
    } catch {
      // No strip: a source that fails never blocks a page (spec §2.3).
    }
  }

  reset(): void {
    this.#gen++;
    this.view = null;
  }
}

export const grid = new GridStore();
