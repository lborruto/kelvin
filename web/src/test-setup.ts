import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { applyLocale } from './lib/i18n';

// jsdom has no ResizeObserver (used by bind:clientWidth); elements simply report no size.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// jsdom has no Web Animations: Svelte's animate:flip asks an element for its running animations
// when it moves or leaves (a toast closed by its action). None run in jsdom.
Element.prototype.getAnimations ??= () => [];

// Every test starts in French (the default), whatever a previous test switched to.
beforeEach(() => {
  applyLocale('fr');
  try {
    localStorage.removeItem('kelvin-locale');
  } catch {
    /* no storage */
  }
});
