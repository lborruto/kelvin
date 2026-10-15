import { describe, expect, it } from 'vitest';
import { applyLocale, dictionary, locale, m, type Messages } from '$lib/i18n';
import { fr } from './fr';
import { intFor, listFor, pluralFor } from './rules';
import { forEachLocale } from './testing';

describe('locale state', () => {
  it('starts French; a switch changes m, the Intl tag and <html lang>', () => {
    expect(locale.current).toBe('fr');
    expect(m.common.cancel).toBe('Annuler');
    applyLocale('en');
    expect([locale.current, locale.intl, m.common.cancel]).toEqual(['en', 'en-GB', 'Cancel']);
    expect(document.documentElement.lang).toBe('en');
    applyLocale('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(dictionary('en').common.retry).toBe('Retry');
  });
  it('a dictionary missing a key does not type-check', () => {
    // @ts-expect-error every group of fr is required in a Messages
    const broken: Messages = { common: fr.common };
    expect(broken).toBeTruthy();
  });
});

describe('rules', () => {
  it('plurals follow each language: French 0 is singular, English 0 is plural', () => {
    expect(pluralFor('fr')(0, { one: 'pièce', other: 'pièces' })).toBe('pièce');
    expect(pluralFor('fr')(2, { one: 'pièce', other: 'pièces' })).toBe('pièces');
    expect(pluralFor('en')(0, { one: 'room', other: 'rooms' })).toBe('rooms');
    expect(pluralFor('en')(1, { one: 'room', other: 'rooms' })).toBe('room');
  });
  it('integers and lists in each language', () => {
    expect(intFor('fr')(2400)).toBe('2\u202f400');
    expect(intFor('en')(2400)).toBe('2,400');
    expect(listFor('fr')(['22:00–06:00', '12:00–14:00'])).toBe('22:00–06:00 et 12:00–14:00');
    expect(listFor('en')(['22:00–06:00', '12:00–14:00'])).toBe('22:00–06:00 and 12:00–14:00');
  });
});

forEachLocale((l) => {
  it('m follows the active locale', () => {
    expect(m.common.cancel).toBe(l === 'fr' ? 'Annuler' : 'Cancel');
  });
});

it('the rooms summary never reads “0 heating” in English', () => {
  const en = dictionary('en');
  expect(en.rooms.heating(0)).toBe('none heating');
  expect(en.rooms.heating(2)).toBe('2 heating');
  expect(dictionary('fr').rooms.heating(0)).toBe('0 en chauffe');
});
