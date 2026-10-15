import { ApiError } from '$lib/api/client';
import type { Pending, Status } from '$lib/api/types';
import { own, type ApiParams } from './rules';
import { m } from './state.svelte';

type Fn = (p: ApiParams) => string;

/** Failures the house store infers after a lost connection (no backend code exists for them). */
export const LOST = 'client_lost';
export const UNKNOWN = 'client_unknown';

/** The text of a code in the active language; an unknown code shows the backend's French
 * `detail`; nothing at all shows the generic message. Never empty, never "undefined". */
export function apiMessage(code: string | null | undefined, params?: ApiParams | null, detail?: string | null): string {
  if (code === 'network' || code === 'unexpected' || code === 'server') return m.error[code];
  const fn = code ? own(m.api as Record<string, Fn>, code) : undefined;
  if (fn) return fn(params ?? {});
  return detail || m.error.unexpected;
}

/** Whatever a call threw, as a sentence for the user. */
export function errorText(e: unknown): string {
  return e instanceof ApiError ? apiMessage(e.code, e.params, e.message) : m.error.unexpected;
}

export function pendingLabel(p: Pending): string {
  const fn = p.label_code ? own(m.action as Record<string, Fn>, p.label_code) : undefined;
  return fn ? fn(p.label_params ?? {}) : p.label;
}

export function pendingError(p: Pending): string {
  if (p.error_code === LOST) return m.pending.lost;
  if (p.error_code === UNKNOWN) return m.pending.unknownResult;
  if (p.error_code) return apiMessage(p.error_code, { ...(p.error_params ?? {}), reason_code: p.reason_code ?? null }, p.error);
  return p.error ?? m.pending.failed;
}

/** Why the last Cozytouch poll failed, in a sentence; the raw error stays in a title= for support. */
export function statusError(s: Status): string | null {
  if (!s.last_error) return null;
  return own(m.cozytouch as Record<string, string>, s.last_error_code ?? 'unknown') ?? m.cozytouch.unknown;
}
