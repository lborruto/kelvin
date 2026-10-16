import { afterEach, describe, expect, it } from 'vitest';
import { DetailStore } from './detail.svelte';

afterEach(() => {
  localStorage.removeItem('kelvin-detail');
  delete document.documentElement.dataset.detail;
});

describe('« détails techniques » preference', () => {
  it('off by default; on is kept per device (localStorage) and mirrored on <html data-detail>', () => {
    const d = new DetailStore();
    expect(d.on).toBe(false);
    d.set(true);
    expect(localStorage.getItem('kelvin-detail')).toBe('on');
    expect(document.documentElement.dataset.detail).toBe('on');
    expect(new DetailStore().on).toBe(true);
    d.set(false);
    expect(localStorage.getItem('kelvin-detail')).toBeNull();
    expect(document.documentElement.dataset.detail).toBeUndefined();
  });
});
