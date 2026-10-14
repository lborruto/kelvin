import { expect, it } from 'vitest';
import { plural } from './plural';

it('uses the singular for 0 and 1, the plural from 2', () => {
  expect(plural(0, 'pièce')).toBe('0 pièce');
  expect(plural(1, 'pièce')).toBe('1 pièce');
  expect(plural(3, 'pièce')).toBe('3 pièces');
});
