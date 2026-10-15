import { describe, expect, it } from 'vitest';
import type { Alert } from './api/types';
import { navAlerts } from './navAlerts';

const a = (kind: string, severity: Alert['severity']) => ({ id: 1, kind, severity }) as unknown as Alert;

describe('navAlerts', () => {
  it('no alert: no dot', () => {
    expect(navAlerts({ active: 0, highest: null }, [])).toEqual({ count: 0, bad: false });
  });
  it('red only for what the user must fix; an offline radiator stays muted', () => {
    expect(navAlerts({ active: 1, highest: 'bad' }, [a('radiator_unreachable', 'bad')])).toEqual({ count: 1, bad: false });
    expect(navAlerts({ active: 2, highest: 'bad' }, [a('radiator_unreachable', 'bad'), a('linky_stalled', 'bad')])).toEqual({ count: 2, bad: true });
    expect(navAlerts({ active: 1, highest: 'warn' }, [a('ecowatt', 'warn')])).toEqual({ count: 1, bad: false });
  });
  it('before the list arrives the dot is muted', () => {
    expect(navAlerts({ active: 3, highest: 'bad' }, null)).toEqual({ count: 3, bad: false });
  });
});
