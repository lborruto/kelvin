import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/api/client';
import type { Pending } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import codes from './api-codes.json';
import { apiMessage, errorText, LOST, pendingError, pendingLabel, statusError } from './codes';
import { en } from './en';
import { fr } from './fr';
import type { ApiParams } from './rules';

type Entry = { params: ApiParams; fr: string };
const ERRORS = codes.errors as Record<string, Entry>;
const LABELS = codes.labels as Record<string, Entry>;
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const call = (group: object, key: string, p: ApiParams) =>
  (group as Record<string, ((p: ApiParams) => string) | undefined>)[key]?.(p);

describe('the backend catalogue', () => {
  it('every error, label and status code has a message in both dictionaries, and nothing more', () => {
    for (const d of [fr, en]) {
      expect(Object.keys(d.api).sort()).toEqual(Object.keys(ERRORS).sort());
      expect(Object.keys(d.action).sort()).toEqual(Object.keys(LABELS).sort());
      expect(Object.keys(d.cozytouch).sort()).toEqual([...codes.status].sort());
    }
  });
  it('the web French says what the backend says (spaces aside)', () => {
    for (const [code, e] of Object.entries(ERRORS)) {
      // send_failed's French detail carries the scrubbed gateway text, never sent as a param: the
      // web words it from the pending's reason_code instead (tested below).
      if (code === 'send_failed') continue;
      expect(norm(call(fr.api, code, e.params)!), code).toBe(norm(e.fr));
    }
    for (const [code, e] of Object.entries(LABELS)) expect(norm(call(fr.action, code, e.params)!), code).toBe(norm(e.fr));
  });
  it('send_failed reads from its reason_code, a generic text when there is none', () => {
    expect(norm(apiMessage('send_failed', { reason_code: 'network' }))).toBe('Envoi impossible : Cozytouch injoignable.');
    expect(norm(apiMessage('send_failed', {}))).toBe('Envoi impossible.');
    expect(norm(apiMessage('send_failed', { reason_code: 'a_newer_reason' }))).toBe('Envoi impossible.');
    applyLocale('en');
    expect(apiMessage('send_failed', { reason_code: 'auth' })).toBe('Couldn’t send: Cozytouch refused the sign-in.');
    expect(apiMessage('send_failed', {})).toBe('Couldn’t send.');
  });
  it('an unknown radiator in a request names no id', () => {
    expect(apiMessage('radiator_unknown_id', {})).toBe('Radiateur inconnu dans la demande.');
    applyLocale('en');
    expect(apiMessage('radiator_unknown_id', {})).toBe('Unknown radiator in the request.');
  });
});

const pending = (over: Partial<Pending>): Pending => ({
  id: 'p1', label: 'Salon : Manuel', radiator_ids: ['r1'], status: 'failed', error: null, created_at: 0, expected: {},
  label_code: 'mode', label_params: { name: 'Salon', mode: 'manual' }, error_code: null, error_params: {}, reason_code: null,
  ...over
});

describe('apiMessage', () => {
  it('a known code reads in the active language', () => {
    expect(apiMessage('too_many_attempts', { minutes: 15 }, 'x')).toBe('Trop de tentatives. Réessayez dans 15\u00a0min.');
    applyLocale('en');
    expect(apiMessage('too_many_attempts', { minutes: 15 }, 'x')).toBe('Too many attempts. Try again in 15\u00a0min.');
    expect(apiMessage('program_too_many', { day: 'sunday' })).toBe('Sunday: 3 comfort periods at most.');
    expect(apiMessage('network')).toBe('Can’t reach Kelvin.');
  });
  it('apiMessage falls back to detail, then to the generic message', () => {
    applyLocale('en');
    expect(apiMessage('a_code_from_a_newer_server', {}, 'Texte du serveur.')).toBe('Texte du serveur.');
    expect(apiMessage(null, {}, 'Texte du serveur.')).toBe('Texte du serveur.');
    expect(apiMessage(null, undefined, '')).toBe('Something went wrong.');
  });
  it('errorText reads any thrown value', () => {
    applyLocale('en');
    expect(errorText(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'))).toBe(
      'Wrong Cozytouch email or password.'
    );
    expect(errorText(new ApiError(500, '', 'server'))).toBe('The Kelvin server hit an error.');
    expect(errorText(new TypeError('boom'))).toBe('Something went wrong.');
  });
});

describe('pending and status', () => {
  it('a pending reads by its codes; the French label is the fallback', () => {
    applyLocale('en');
    expect(pendingLabel(pending({}))).toBe('Salon: Manual');
    expect(pendingLabel(pending({ label_code: null }))).toBe('Salon : Manuel');
    expect(pendingError(pending({ error_code: 'radiator_refused', error: 'Le radiateur a refusé la commande.' }))).toBe(
      'The radiator rejected the command.'
    );
    expect(pendingError(pending({ error_code: 'send_failed', error_params: {}, reason_code: 'quota' }))).toBe(
      'Couldn’t send: Cozytouch rate limit.'
    );
    expect(pendingError(pending({ error_code: LOST }))).toBe('Command not confirmed (connection lost).');
    expect(pendingError(pending({}))).toBe('Command failed.');
  });
  it('the Cozytouch status reads by its code; none when nothing failed', () => {
    applyLocale('en');
    expect(statusError({ connected: false, last_ok_at: null, last_error: 'QUOTA', last_error_code: 'quota' })).toBe(
      'Cozytouch request limit reached.'
    );
    expect(statusError({ connected: false, last_ok_at: null, last_error: 'x' })).toBe('Cozytouch error.');
    expect(statusError({ connected: true, last_ok_at: 1, last_error: null })).toBeNull();
  });
});
