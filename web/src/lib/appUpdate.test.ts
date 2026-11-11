import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdater, CHECK_EVERY_MS, CHECK_MIN_GAP_MS, nextStep, shouldCheck } from './appUpdate';
import { holdReload, reloadHeld, sendStarted, sending } from './busy';

describe('when to look for a new version', () => {
  const t0 = Date.parse('2026-11-11T08:00:00Z');
  const seen = { visible: true, online: true };
  it('when the tab comes back, but not twice within a minute', () => {
    expect(shouldCheck(t0, null, seen)).toBe(true);
    expect(shouldCheck(t0 + CHECK_MIN_GAP_MS - 1, t0, seen)).toBe(false);
    expect(shouldCheck(t0 + CHECK_MIN_GAP_MS, t0, seen)).toBe(true);
  });
  it('never from a hidden tab or with no network: the next return checks', () => {
    expect(shouldCheck(t0 + CHECK_EVERY_MS, t0, { visible: false, online: true })).toBe(false);
    expect(shouldCheck(t0 + CHECK_EVERY_MS, t0, { visible: true, online: false })).toBe(false);
  });
});

describe('what to do with a new version', () => {
  const s = (over: object = {}) => ({ hidden: false, busy: false, asked: false, ...over });
  it('nothing without one', () => {
    expect(nextStep('none', s({ hidden: true }))).toBe('none');
  });
  it('a visible page is never reloaded on its own: it gets the offer', () => {
    expect(nextStep('waiting', s())).toBe('offer');
    expect(nextStep('activated', s())).toBe('offer');
  });
  it('a hidden, idle page takes it', () => {
    expect(nextStep('waiting', s({ hidden: true }))).toBe('apply');
    expect(nextStep('activated', s({ hidden: true }))).toBe('reload');
  });
  it('« Mettre à jour » takes it on a visible page', () => {
    expect(nextStep('waiting', s({ asked: true }))).toBe('apply');
    expect(nextStep('activated', s({ asked: true }))).toBe('reload');
  });
  it('never while a setpoint waits, a send is in flight or edits are unsent, hidden or asked', () => {
    for (const stage of ['waiting', 'activated'] as const) {
      expect(nextStep(stage, s({ hidden: true, busy: true }))).toBe('none');
      expect(nextStep(stage, s({ asked: true, busy: true }))).toBe('none');
    }
  });
});

describe('holdReload', () => {
  it('holds until every holder lets go', () => {
    expect(reloadHeld()).toBe(false);
    const a = holdReload();
    const b = holdReload();
    expect(reloadHeld()).toBe(true);
    a();
    a(); // letting go twice counts once
    expect(reloadHeld()).toBe(true);
    b();
    expect(reloadHeld()).toBe(false);
  });
  it('a write in flight counts until it is over', () => {
    expect(sending()).toBe(false);
    const done = sendStarted();
    expect(sending()).toBe(true);
    done();
    done();
    expect(sending()).toBe(false);
  });
});

describe('AppUpdater', () => {
  let hidden = false;
  let busy = false;
  const make = () => {
    const io = { apply: vi.fn(), reload: vi.fn(), offer: vi.fn(), hidden: () => hidden, busy: () => busy };
    return { io, up: new AppUpdater(io) };
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-11T08:00:00Z'));
    hidden = false;
    busy = false;
  });
  afterEach(() => vi.useRealTimers());

  it('a new version on a visible page: one offer, no reload; the page hidden later takes it and reloads unseen', () => {
    const { io, up } = make();
    up.needRefresh();
    up.needRefresh();
    expect(io.offer).toHaveBeenCalledTimes(1);
    expect(io.apply).not.toHaveBeenCalled();
    hidden = true;
    up.visibility();
    expect(io.apply).toHaveBeenCalledTimes(1);
    // The new service worker took control.
    up.needReload();
    expect(io.reload).toHaveBeenCalledTimes(1);
  });

  it('a new version found while hidden is taken at once, with no offer', () => {
    const { io, up } = make();
    hidden = true;
    up.needRefresh();
    expect(io.apply).toHaveBeenCalledTimes(1);
    expect(io.offer).not.toHaveBeenCalled();
    up.visibility();
    expect(io.apply).toHaveBeenCalledTimes(1);
  });

  it('the owner came back before the new version took control: no reload under their finger, the offer instead', () => {
    const { io, up } = make();
    hidden = true;
    up.needRefresh();
    hidden = false;
    up.needReload();
    expect(io.reload).not.toHaveBeenCalled();
    expect(io.offer).toHaveBeenCalledTimes(1);
    up.ask();
    expect(io.reload).toHaveBeenCalledTimes(1);
  });

  it('another tab took the new version: this one reloads only once hidden or asked', () => {
    const { io, up } = make();
    up.needRefresh();
    up.needReload();
    expect(io.reload).not.toHaveBeenCalled();
    expect(io.offer).toHaveBeenCalledTimes(1);
    hidden = true;
    up.visibility();
    expect(io.reload).toHaveBeenCalledTimes(1);
    expect(io.apply).not.toHaveBeenCalled();
  });

  it('« Mettre à jour » while a setpoint waits: applied as soon as it is sent, never before', () => {
    const { io, up } = make();
    up.needRefresh();
    busy = true;
    up.ask();
    vi.advanceTimersByTime(5000);
    expect(io.apply).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(500);
    expect(io.apply).toHaveBeenCalledTimes(1);
    up.needReload();
    expect(io.reload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hidden page with a send in flight is left alone', () => {
    const { io, up } = make();
    hidden = true;
    busy = true;
    up.needRefresh();
    up.needReload();
    vi.advanceTimersByTime(60_000);
    expect(io.apply).not.toHaveBeenCalled();
    expect(io.reload).not.toHaveBeenCalled();
    // Seen again once the send is over and the page hides anew.
    busy = false;
    up.visibility();
    expect(io.reload).toHaveBeenCalledTimes(1);
  });

  it('stop() ends the wait', () => {
    const { io, up } = make();
    up.needRefresh();
    busy = true;
    up.ask();
    up.stop();
    busy = false;
    vi.advanceTimersByTime(5000);
    expect(io.apply).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
