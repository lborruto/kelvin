import type { RoomActivity, RoomEnergy, RoomsDuty } from '$lib/api/types';

export interface Entry<T> {
  value: T | null;
  error: boolean;
}

/** A keyed cache of read-only room figures: one fetch per key while fresh, none in flight twice,
 * and nothing from a previous session written after a reset (logout). A failed refresh keeps
 * the last value; a failed first load is an error entry (the UI shows « — »). */
export class Cache<T> {
  data = $state<Record<string, Entry<T>>>({});
  #stamp = new Map<string, number>();
  #inflight = new Map<string, Promise<void>>();
  #gen = 0;
  #maxAgeMs: number;
  #now: () => number;

  constructor(maxAgeMs: number, now: () => number = () => Date.now()) {
    this.#maxAgeMs = maxAgeMs;
    this.#now = now;
  }

  reset(): void {
    this.#gen++;
    this.data = {};
    this.#stamp.clear();
    this.#inflight.clear();
  }

  load(key: string, fetch: () => Promise<T>): Promise<void> {
    const at = this.#stamp.get(key);
    if (at !== undefined && this.#now() - at < this.#maxAgeMs) return Promise.resolve();
    const running = this.#inflight.get(key);
    if (running) return running;
    const gen = this.#gen;
    const p = fetch()
      .then((value) => {
        if (gen !== this.#gen) return;
        this.data[key] = { value, error: false };
        this.#stamp.set(key, this.#now());
      })
      .catch(() => {
        if (gen === this.#gen && !this.data[key]) this.data[key] = { value: null, error: true };
      })
      .finally(() => {
        if (gen === this.#gen) this.#inflight.delete(key);
      });
    this.#inflight.set(key, p);
    return p;
  }
}

export const roomEnergy = new Cache<RoomEnergy>(300_000);
export const roomActivity = new Cache<RoomActivity>(300_000);
export const roomsDuty = new Cache<RoomsDuty>(600_000);

export function resetRoomData(): void {
  roomEnergy.reset();
  roomActivity.reset();
  roomsDuty.reset();
}
