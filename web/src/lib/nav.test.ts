import { describe, expect, it } from 'vitest';
import { NAV_BOTTOM, NAV_ICON, NAV_TOP, sidebarRooms } from './nav';

describe('the Tableau nav model', () => {
  it('Maison, Programme, Énergie on top; Réglages (/home) at the bottom; glyphs per destination', () => {
    expect(NAV_TOP.map((n) => n.href)).toEqual(['/', '/schedule', '/energy']);
    expect(NAV_BOTTOM.map((n) => n.href)).toEqual(['/home']);
    expect(NAV_ICON).toEqual({ rooms: 'home', schedule: 'cal', energy: 'chart', home: 'gear' });
  });
  it('sidebar rows: offline rooms last in their own order, no reading and never heating', () => {
    const room = (id: string, temperature: number | null) => ({ id, name: id, radiator_ids: [id], temperature }) as never;
    const rads: Record<string, unknown[]> = {
      a: [{ reachable: false, temperature: null }],
      b: [{ reachable: true, temperature: 19.5 }],
      c: [{ reachable: false, temperature: 18 }],
      d: [{ reachable: true, temperature: 20.25 }]
    };
    const rows = sidebarRooms([room('a', null), room('b', 19.5), room('c', 18), room('d', 20.25)], (id) => rads[id] as never, (id) => id !== 'b', (r) => r.name);
    expect(rows.map((r) => [r.id, r.offline, r.heating])).toEqual([
      ['b', false, false],
      ['d', false, true],
      ['a', true, false],
      ['c', true, false]
    ]);
    expect(rows[2].reading).toBeNull();
  });
});
