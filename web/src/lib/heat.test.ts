import { describe, expect, it } from 'vitest';
import { heatColor, RAMP_DOMAIN } from './heat';

describe('heatColor', () => {
  it('maps the ramp ends and middle to the theme stop tokens', () => {
    expect([...RAMP_DOMAIN]).toEqual([15, 20, 25]);
    expect(heatColor(15)).toBe('var(--cool)');
    expect(heatColor(20)).toBe('var(--neutral)');
    expect(heatColor(25)).toBe('var(--warm)');
  });
  it('mixes linearly between two stops, so it follows the active theme', () => {
    expect(heatColor(17.5)).toBe('color-mix(in srgb, var(--cool) 50%, var(--neutral))');
    expect(heatColor(16)).toBe('color-mix(in srgb, var(--cool) 80%, var(--neutral))');
    expect(heatColor(23.6)).toBe('color-mix(in srgb, var(--neutral) 28%, var(--warm))');
  });
  it('clamps outside the domain', () => {
    expect(heatColor(5)).toBe('var(--cool)');
    expect(heatColor(40)).toBe('var(--warm)');
  });
  it('uses the faint colour when unknown', () => {
    expect(heatColor(null)).toBe('var(--fa)');
    expect(heatColor(undefined)).toBe('var(--fa)');
    expect(heatColor(Number.NaN)).toBe('var(--fa)');
  });
});
