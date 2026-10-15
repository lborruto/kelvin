import type { Alert, AlertSummary } from './api/types';

/** The nav's alert dot on Maison (direction-2 §6): how many alerts are active and whether the dot is red.
 * Red only for what the user must fix: an offline radiator (`radiator_unreachable`) is never red, whatever
 * its backend severity, so the dot reads the list when it is loaded and stays muted otherwise. */
export function navAlerts(summary: AlertSummary, list: Alert[] | null): { count: number; bad: boolean } {
  const count = summary.active;
  const bad = count > 0 && !!list?.some((a) => a.severity === 'bad' && a.kind !== 'radiator_unreachable');
  return { count, bad };
}
