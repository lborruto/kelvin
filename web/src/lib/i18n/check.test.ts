import { describe, expect, it } from 'vitest';
import { flattenKeys, scanSource, unusedKeys } from '../../../scripts/i18n-check.mjs';

const ts = (s: string) => scanSource(s, false).map((f) => f.text);
const svelte = (s: string) => scanSource(s, true).map((f) => f.text);

describe('scanSource', () => {
  it('finds French in script literals, template literals and accent-free UI words', () => {
    expect(ts("const a = 'Pièces';")).toEqual(['Pièces']);
    expect(ts('const t = `il y a ${n} min`;')).toEqual(['il y a min']);
    expect(ts("const l = [{ label: 'Maison' }];")).toEqual(['Maison']);
    expect(ts("const e = 'Rooms'; const k = 'kelvin-locale';")).toEqual([]);
  });
  it('finds literals nested in a template expression and accent-free words', () => {
    expect(ts("const t = `${a} — ${b ?? 'échec de la commande.'}`;")).toEqual(['échec de la commande.']);
    expect(ts("const e = 'Erreur inattendue.';")).toEqual(['Erreur inattendue.']);
    expect(ts("const l = { off: 'Repos', frost: 'Hors-gel' };")).toEqual(['Repos', 'Hors-gel']);
  });
  it('finds French in markup text and attributes, not in classes, ids or test ids', () => {
    expect(svelte('<h1>Maison</h1>')).toEqual(['Maison']);
    expect(svelte('<button aria-label="Fermer">x</button>')).toEqual(['Fermer']);
    expect(svelte('<h1>{m.nav.home}</h1><div class="tout" id="tarif" data-testid="bar-jour"></div>')).toEqual([]);
  });
  it('ignores comments, styles and lines marked i18n-ignore', () => {
    expect(ts("// Pièces\n/* Maison */\nconst x = 1;")).toEqual([]);
    expect(svelte('<!-- Maison --><style>.maison::after { content: "Pièce"; }</style>')).toEqual([]);
    expect(ts("if (name !== 'Radiateur') x(); // i18n-ignore: upstream device default")).toEqual([]);
    expect(ts("const url = 'https://www.myelectricaldata.fr';")).toEqual([]);
    expect(ts("/* legacy-paths:start — data */\nconst H = { '#tarif': '#tariff' };\n/* legacy-paths:end */")).toEqual([]); // legacy-path-test
  });
  it('reports the line of each finding', () => {
    expect(scanSource("const a = 1;\nconst b = 'Envoi…';", false)).toEqual([{ line: 2, text: 'Envoi…' }]);
  });
});

describe('keys', () => {
  it('flattens nested groups; functions are leaves', () => {
    expect(flattenKeys({ nav: { rooms: 'Pièces' }, rooms: { count: (n: number) => `${n}` } })).toEqual([
      'nav.rooms',
      'rooms.count'
    ]);
  });
  it('a key is used when a source reads m.<path>, or when it sits under a dynamic parent', () => {
    const corpus = '<a>{m.nav.rooms}</a> {m.rooms.count(3)} {m.mode[mode]}';
    expect(unusedKeys(['nav.rooms', 'nav.home', 'rooms.count', 'mode.off', 'nav.roomsX'], corpus, ['mode'])).toEqual([
      'nav.home',
      'nav.roomsX'
    ]);
  });
});
