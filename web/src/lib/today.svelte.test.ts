import { afterEach, describe, expect, it, vi } from 'vitest';
import { Today } from './today.svelte';

afterEach(() => {
  vi.useRealTimers();
});

describe('Today', () => {
  it('turns at Paris midnight while the page stays open, night after night', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T23:59:30+02:00'));
    const t = new Today();
    expect(t.iso).toBe('2026-10-15');
    vi.advanceTimersByTime(29_000);
    expect(t.iso).toBe('2026-10-15');
    vi.advanceTimersByTime(2_000);
    expect(t.iso).toBe('2026-10-16');
    vi.advanceTimersByTime(24 * 3600_000);
    expect(t.iso).toBe('2026-10-17');
  });

  it('follows Paris, not UTC, across the autumn DST night (a 25-hour day)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T00:30:00+02:00'));
    const t = new Today();
    expect(t.iso).toBe('2026-10-25');
    // 23:59:30 Paris (UTC+1 after the change) is 22:59:30Z: still the 25th, though 24 h have passed.
    vi.advanceTimersByTime(24.5 * 3600_000 - 30_000);
    expect(t.iso).toBe('2026-10-25');
    vi.advanceTimersByTime(31_000);
    expect(t.iso).toBe('2026-10-26');
  });

  it('checks again when the page comes back into view (a sleeping tab’s timers run late)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00+02:00'));
    const t = new Today();
    vi.setSystemTime(new Date('2026-10-17T08:00:00+02:00')); // the clock moved, no timer ran
    expect(t.iso).toBe('2026-10-15');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(t.iso).toBe('2026-10-17');
  });
});
