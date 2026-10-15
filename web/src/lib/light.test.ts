import { describe, expect, it } from 'vitest';
import { snapIntensity, stepIntensity } from './light';

describe('night-light steps', () => {
  it('snaps to 1 and multiples of 5', () => {
    expect([0, 1, 3, 4, 6, 12, 98, 120].map(snapIntensity)).toEqual([1, 1, 1, 5, 5, 10, 100, 100]);
  });
  it('arrows move by 5, pages by 25, Home and End to the ends', () => {
    expect(stepIntensity(1, 'ArrowRight')).toBe(5);
    expect(stepIntensity(5, 'ArrowUp')).toBe(10);
    expect(stepIntensity(5, 'ArrowLeft')).toBe(1);
    expect(stepIntensity(1, 'ArrowDown')).toBe(1);
    expect(stepIntensity(1, 'PageUp')).toBe(25);
    expect(stepIntensity(90, 'PageUp')).toBe(100);
    expect(stepIntensity(30, 'PageDown')).toBe(5);
    expect(stepIntensity(40, 'Home')).toBe(1);
    expect(stepIntensity(40, 'End')).toBe(100);
    expect(stepIntensity(40, 'Enter')).toBeNull();
  });
});
