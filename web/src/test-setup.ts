import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { applyLocale } from './lib/i18n';

// jsdom has no ResizeObserver (used by bind:clientWidth); elements simply report no size.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Every test starts in French (the default), whatever a previous test switched to.
beforeEach(() => {
  applyLocale('fr');
  try {
    localStorage.removeItem('kelvin-locale');
  } catch {
    /* no storage */
  }
});
