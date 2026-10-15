import { own } from './rules';
import { m } from './state.svelte';

/** A room or radiator mode by its API key ('off' | 'manual' | 'program' | 'other' | 'mixed'). */
export function modeLabel(mode: string | null | undefined): string {
  return own(m.mode as Record<string, string>, mode ?? 'other') ?? m.mode.other;
}

/** A heating level by its API key; null when there is none or Kelvin does not know it. */
export function levelLabel(level: string | null | undefined): string | null {
  return level ? (own(m.level as Record<string, string>, level) ?? null) : null;
}
