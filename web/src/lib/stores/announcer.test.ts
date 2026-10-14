import { beforeEach, describe, expect, it } from 'vitest';
import { announcer } from './announcer.svelte';
import { HouseStore } from './house.svelte';

const pending = (status: string, extra = {}) => ({
  id: 'p1', label: 'Salon : Manuel', radiator_ids: ['a'], status, error: null, created_at: 1, expected: {}, ...extra
});

beforeEach(() => announcer.clear());

describe('announcer', () => {
  it('re-announces an identical message as a change', () => {
    announcer.say('Confort : 20,5 °C');
    const first = announcer.polite;
    announcer.say('Confort : 20,5 °C');
    expect(announcer.polite).not.toBe(first);
    expect(announcer.polite.trim()).toBe('Confort : 20,5 °C');
  });
});

describe('command progress', () => {
  it('announces Envoi…, then Confirmé, for a command sent from here', () => {
    const store = new HouseStore(() => 0);
    store.watch('p1');
    store.applyPending(pending('sending') as never);
    expect(announcer.polite).toBe('Salon : Manuel — envoi…');
    store.applyPending(pending('pending') as never);
    expect(announcer.polite).toBe('Salon : Manuel — envoi…');
    store.applyPending(pending('confirmed') as never);
    expect(announcer.polite).toBe('Salon : Manuel — confirmé');
  });

  it('announces a failure assertively', () => {
    const store = new HouseStore(() => 0);
    store.watch('p1');
    store.applyPending(pending('sending') as never);
    store.applyPending(pending('failed', { error: 'Pas de confirmation du radiateur.' }) as never);
    expect(announcer.assertive).toBe('Salon : Manuel — Pas de confirmation du radiateur.');
  });

  it('stays quiet about commands sent elsewhere', () => {
    const store = new HouseStore(() => 0);
    store.applyPending(pending('sending') as never);
    store.applyPending(pending('confirmed') as never);
    expect(announcer.polite).toBe('');
  });
});

describe('online', () => {
  it('stays usable while a loaded house refreshes its stream; blocks while reconnecting', () => {
    const store = new HouseStore(() => 0);
    expect(store.online).toBe(false); // nothing loaded yet
    store.applySnapshot({ house: { rooms: [], radiators: [] }, pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null } } as never);
    expect(store.online).toBe(true);
    // A phone coming back after 10 s hidden re-opens the stream: the data on screen is still good.
    store.connection = 'connecting';
    expect(store.online).toBe(true);
    // A real outage (the banner says so): no answer could arrive.
    store.connection = 'reconnecting';
    expect(store.online).toBe(false);
  });
});
