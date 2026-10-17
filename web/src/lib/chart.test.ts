import { describe, expect, it } from 'vitest';
import { cardLeft, guideCard, nearestIndex, stepIndex, swipeDirection } from './chart';

describe('chart pointer and keyboard math', () => {
  it('the nearest bar to the pointer wins (ties go left)', () => {
    expect(nearestIndex([100, 300, 500], 260)).toBe(1);
    expect(nearestIndex([100, 300, 500], 200)).toBe(0);
    expect(nearestIndex([100, 300, 500], -40)).toBe(0);
    expect(nearestIndex([], 10)).toBeNull();
  });

  it('keys move by one, jump to the ends, page by 3 h, and stay in range', () => {
    expect(stepIndex('ArrowRight', 2, 3)).toBe(2);
    expect(stepIndex('ArrowLeft', 0, 3)).toBe(0);
    expect(stepIndex('ArrowLeft', 2, 3)).toBe(1);
    expect(stepIndex('Home', 2, 48)).toBe(0);
    expect(stepIndex('End', 2, 48)).toBe(47);
    expect(stepIndex('PageUp', 40, 48)).toBe(46);
    expect(stepIndex('PageUp', 44, 48)).toBe(47);
    expect(stepIndex('PageDown', 3, 48)).toBe(0);
    expect(stepIndex('Enter', 3, 48)).toBeNull();
  });

  it('cardLeft flips at the edges and never overflows', () => {
    expect(cardLeft(25, 150, 600)).toBe(183); // room on the right
    expect(cardLeft(425, 150, 600)).toBe(157); // flipped to the left of the bar
    expect(cardLeft(100, 20, 300)).toBe(0); // no room either side: centred, clamped
    expect(cardLeft(10, 20, 270)).toBe(0);
  });

  it('a horizontal swipe steps the period; a short or vertical move does not', () => {
    expect(swipeDirection(-60, 10)).toBe(1);
    expect(swipeDirection(60, 5)).toBe(-1);
    expect(swipeDirection(30, 0)).toBeNull();
    expect(swipeDirection(60, 40)).toBeNull();
  });

  it('guideCard sits beside the guide line, else under the plot, and never covers the point read', () => {
    expect(guideCard(40, 600, 120)).toEqual({ left: 52, top: 0 }); // right of it
    expect(guideCard(560, 600, 120)).toEqual({ left: 288, top: 0 }); // left of it
    const under = guideCard(200, 400, 120); // neither side fits: under the plot, clamped
    expect(under).toEqual({ left: 70, top: 120 });
    expect(guideCard(10, 300, 120)).toEqual({ left: 22, top: 0 });
    expect(guideCard(150, 300, 120).top).toBe(120);
    expect(guideCard(150, 300, 120).left).toBe(20);
  });
});
