import type { GridView } from '$lib/api/types';

/** Tempo and EcoWatt for the strip (spec §5.1 QW1). The snapshot and the SSE `grid` event keep it current. */
export class GridStore {
  view = $state<GridView | null>(null);

  apply(v: GridView | null | undefined): void {
    if (v !== undefined) this.view = v;
  }

  reset(): void {
    this.view = null;
  }
}

export const grid = new GridStore();
