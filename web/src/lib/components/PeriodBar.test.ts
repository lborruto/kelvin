import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PeriodBar from './PeriodBar.svelte';

let fire: (e: Partial<IntersectionObserverEntry>) => void;
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
        fire = (e) => cb([e]);
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

const props = (o = {}) => ({
  title: 'Octobre 2026', view: 'Mois', canPrev: true, canNext: false, onstep: vi.fn(), anchor: document.createElement('div'), ...o
});

describe('PeriodBar', () => {
  it('appears only once the navigator has left above the screen; hidden it is inert', async () => {
    const { container } = render(PeriodBar, { props: props() });
    const bar = container.querySelector<HTMLElement>('.period-bar')!;
    expect(bar).not.toHaveClass('shown');
    expect(bar.inert).toBe(true);
    fire({ isIntersecting: false, boundingClientRect: { bottom: -10 } as DOMRect });
    await tick();
    expect(bar).toHaveClass('shown');
    expect(bar.inert).toBe(false);
    // Below the screen (a short page): no bar.
    fire({ isIntersecting: false, boundingClientRect: { bottom: 2000 } as DOMRect });
    await tick();
    expect(bar).not.toHaveClass('shown');
    fire({ isIntersecting: true, boundingClientRect: { bottom: 40 } as DOMRect });
    await tick();
    expect(bar).not.toHaveClass('shown');
  });

  it('repeats the navigator for the eye only: aria-hidden, out of the tab order; its buttons step', async () => {
    const onstep = vi.fn();
    const { container } = render(PeriodBar, { props: props({ onstep }) });
    const bar = container.querySelector('.period-bar')!;
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveTextContent('Octobre 2026· Mois');
    const [prev, next] = bar.querySelectorAll('button');
    expect(prev).toHaveAttribute('tabindex', '-1');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(prev);
    await fireEvent.click(next);
    expect(onstep.mock.calls).toEqual([[-1]]);
  });
});
