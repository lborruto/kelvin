import { describe, expect, it } from 'vitest';
import { agg } from './room';

describe('agg', () => {
  it('returns the common value, the rounded mean when mixed, null when unknown', () => {
    expect(agg([20, 20])).toEqual({ value: 20, mixed: false });
    expect(agg([20, 21])).toEqual({ value: 20.5, mixed: true });
    expect(agg([19, 21, null])).toEqual({ value: 20, mixed: true });
    expect(agg([null, undefined])).toEqual({ value: null, mixed: false });
  });
});
