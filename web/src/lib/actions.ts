import { ApiError } from './api/client';
import type { CommandResult, Pending } from './api/types';
import { house } from './stores/house.svelte';
import { toasts } from './stores/toasts.svelte';

const MAX_REPLAYS = 50;
const replays = new Map<string, () => Promise<CommandResult>>();

/** Send a command, show its pending state, remember how to re-send it. */
export async function run(fn: () => Promise<CommandResult>): Promise<Pending | null> {
  try {
    const { pending } = await fn();
    if (pending) {
      house.watch(pending.id);
      house.applyPending(pending);
      replays.set(pending.id, fn);
      if (replays.size > MAX_REPLAYS) replays.delete(replays.keys().next().value as string);
    }
    return pending;
  } catch (e) {
    toasts.push(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    return null;
  }
}

/** Send a house-wide command: every HouseActions then shows its progress and blocks a re-send. */
// One house-wide command in flight at a time, across every HouseActions instance:
// the buttons only disable once the Pending arrives, so a fast double tap lands here.
let houseInFlight = false;

export async function runHouse(fn: () => Promise<CommandResult>): Promise<Pending | null> {
  if (houseInFlight) return null;
  houseInFlight = true;
  try {
    const p = await run(fn);
    if (p) house.houseCommandId = p.id;
    return p;
  } finally {
    houseInFlight = false;
  }
}

export async function retry(pendingId: string): Promise<Pending | null> {
  const fn = replays.get(pendingId);
  if (!fn) {
    toasts.push('Impossible de réessayer ici : refaites l’action.');
    return null;
  }
  house.dismiss(pendingId);
  replays.delete(pendingId);
  const p = await run(fn);
  if (p && house.houseCommandId === pendingId) house.houseCommandId = p.id;
  return p;
}
