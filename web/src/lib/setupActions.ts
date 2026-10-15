/** Setup writes from the device screen: pending and Réessayer through run(), then an undo. */
import type { CommandResult, Pending } from './api/types';
import { run } from './actions';
import { m, pendingLabel } from './i18n';
import { house } from './stores/house.svelte';
import { toasts } from './stores/toasts.svelte';

export const UNDO_MS = 10_000;
const undos = new Map<string, () => Promise<CommandResult>>();
// Targets with a write on its way to the server (room:<id>, radiator:<id>, create, …): the controls
// pause only once the Pending arrives, so an Enter + click + Enter lands here (review T11-1).
const inFlight = new Set<string>();

/** Send a setup write, at most one per `key` (its target) at a time: a second call while the first
 * is unresolved is ignored. Once Cozytouch confirms it, offer « Annuler » (the inverse) for 10 s. */
export async function runSetup(
  fn: () => Promise<CommandResult>,
  undo?: () => Promise<CommandResult>,
  key = 'setup'
): Promise<Pending | null> {
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  let p: Pending | null;
  try {
    p = await run(fn);
  } finally {
    inFlight.delete(key);
  }
  if (p && undo) {
    undos.set(p.id, undo);
    if (p.status === 'confirmed') onSetupSettled(p);
  }
  return p;
}

export function onSetupSettled(p: Pending): void {
  const undo = undos.get(p.id);
  if (!undo) return;
  undos.delete(p.id);
  if (p.status !== 'confirmed') return;
  toasts.push(() => m.devices.done(pendingLabel(p)), 'info', UNDO_MS, {
    label: () => m.devices.undo,
    run: () => void runSetup(undo, undefined, `undo:${p.id}`)
  });
}

export function installUndo(): void {
  house.onSettle = onSetupSettled;
}
