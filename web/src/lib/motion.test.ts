import { afterEach, describe, expect, it, vi } from 'vitest';
import { dur, easeOut, flash, reducedMotion, rise } from './motion';

function media(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q }));
  Element.prototype.animate ??= (() => ({})) as never;
}

afterEach(() => vi.unstubAllGlobals());

describe('motion', () => {
  it('keeps durations when motion is allowed', () => {
    media(false);
    expect(reducedMotion()).toBe(false);
    expect(dur(220)).toBe(220);
    expect(rise(document.body).duration).toBe(220);
  });

  it('turns Svelte transitions instant under reduced motion', () => {
    media(true);
    expect(reducedMotion()).toBe(true);
    expect(dur(220)).toBe(0);
    expect(rise(document.body).duration).toBe(0);
    expect(flash(document.body).duration).toBe(0);
  });

  it('eases out like cubic-bezier(0.16, 1, 0.3, 1)', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    // Most of the travel happens early: a confident arrival.
    expect(easeOut(0.25)).toBeGreaterThan(0.6);
    expect(easeOut(0.5)).toBeGreaterThan(easeOut(0.25));
  });
});
