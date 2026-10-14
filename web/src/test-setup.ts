import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver (used by bind:clientWidth); elements simply report no size.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
