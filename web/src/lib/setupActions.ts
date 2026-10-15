/** Setup writes from the device screen: pending and Réessayer through run(), then an undo. */
import type { CommandResult, Pending } from './api/types';
import { run } from './actions';
import { m, pendingLabel } from './i18n';
import { house } from './stores/house.svelte';
import { toasts } from './stores/toasts.svelte';

export const UNDO_MS = 10_000;
const undos = new Map<string, () => Promise<CommandResult>>();

/** Send a setup write. Once Cozytouch confirms it, offer « Annuler » (the inverse write) for 10 s. */
export async function runSetup(
  fn: () => Promise<CommandResult>,
  undo?: () => Promise<CommandResult>
): Promise<Pending | null> {
  const p = await run(fn);
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
    run: () => void runSetup(undo)
  });
}

export function installUndo(): void {
  house.onSettle = onSetupSettled;
}
