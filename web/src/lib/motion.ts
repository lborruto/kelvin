/**
 * The motion system for Svelte transitions. CSS reads the same values from the tokens in app.css
 * (--ease-out, --t-state, --t-enter, --t-exit, --t-morph, --t-data).
 *
 * Svelte transitions run on the Web Animations API, so a CSS media query cannot reach them: every
 * transition takes its duration through `dur()`, which is 0 under reduced motion (and where the
 * browser has no Web Animations API at all).
 */
import type { TransitionConfig } from 'svelte/transition';

export const T = { press: 100, state: 160, enter: 220, exit: 150, morph: 250, data: 360 } as const;

const REDUCE = '(prefers-reduced-motion: reduce)';

/** True when animations should not move: the user asked for reduced motion, or nothing can animate. */
export function reducedMotion(): boolean {
  if (typeof matchMedia !== 'function' || typeof Element === 'undefined') return true;
  if (typeof Element.prototype.animate !== 'function') return true;
  return matchMedia(REDUCE).matches;
}

/** A Svelte transition duration: `ms`, or 0 under reduced motion. */
export const dur = (ms: number): number => (reducedMotion() ? 0 : ms);

/** cubic-bezier(x1, y1, x2, y2) as an easing function (Newton–Raphson on x, then y). */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (x(t) - p) / d;
    }
    return y(Math.min(1, Math.max(0, t)));
  };
}

/** --ease-out: a confident deceleration for arrivals. */
export const easeOut = bezier(0.16, 1, 0.3, 1);
/** --ease-in: for exits. */
export const easeIn = bezier(0.4, 0, 1, 1);

/** Enter by rising `y` px while fading in; exits use `fade`. Opacity only under reduced motion. */
export function rise(_node: Element, { y = 8, duration = T.enter, delay = 0 } = {}): TransitionConfig {
  if (reducedMotion()) return { duration: 0 };
  return { delay, duration, easing: easeOut, css: (t, u) => `opacity: ${t}; transform: translateY(${u * y}px)` };
}

/** A live figure acknowledging an update: dips to 45 % and comes back. Never on first render. */
export function flash(_node: Element, { duration = 400 } = {}): TransitionConfig {
  return { duration: dur(duration), easing: easeOut, css: (t) => `opacity: ${0.45 + 0.55 * t}` };
}
