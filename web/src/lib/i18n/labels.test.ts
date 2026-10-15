import { expect, it } from 'vitest';
import { applyLocale } from './index';
import { levelLabel, modeLabel } from './labels';

it('modes and heating levels by key, in the active language', () => {
  expect([modeLabel('program'), modeLabel('mixed'), modeLabel(null)]).toEqual(['Programme', 'Mixte', 'Autre']);
  expect([levelLabel('frostprotection'), levelLabel('off'), levelLabel('turbo'), levelLabel(null)]).toEqual([
    'Hors-gel', 'Repos', null, null
  ]);
  applyLocale('en');
  expect([modeLabel('program'), modeLabel('off'), levelLabel('frostprotection'), levelLabel('off')]).toEqual([
    'Schedule', 'Off', 'Frost protection', 'Idle'
  ]);
});

it('a key named after an Object.prototype member is unknown', () => {
  expect(modeLabel('toString')).toBe('Autre');
  expect(levelLabel('constructor')).toBeNull();
});
