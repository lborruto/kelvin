import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenKeys, frozenMessages, scanFiles, scanSource, unusedKeys } from '../../../scripts/i18n-check.mjs';
import { fr } from './fr';

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
    expect(ts("const e = 'Erreur inattendue. Réessayez.';")).toEqual(['Erreur inattendue. Réessayez.']);
    expect(ts("const l = { off: 'Repos', frost: 'Hors-gel' };")).toEqual(['Repos', 'Hors-gel']);
  });
  it('finds French in markup text and attributes, not in classes, ids or test ids', () => {
    expect(svelte('<h1>Maison</h1>')).toEqual(['Maison']);
    expect(svelte('<button aria-label="Fermer">x</button>')).toEqual(['Fermer']);
    expect(svelte('<h1>{m.nav.home}</h1><div class="tout" id="tarif" data-testid="bar-jour"></div>')).toEqual([]); // legacy-path-test
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

describe('scanSource limits (batch-1 review M2)', () => {
  it('an attribute whose name ends like a skipped one is still copy', () => {
    expect(svelte('<input aria-invalid="Erreur" />')).toEqual(['Erreur']);
    expect(svelte('<p data-hint="Maison"></p>')).toEqual(['Maison']);
    expect(svelte('<p id="maison"></p>')).toEqual([]);
  });
  it('a regex literal holding a quote does not hide the next string', () => {
    expect(ts("const r = /'/; const t = 'Pièces';")).toEqual(['Pièces']);
    expect(ts('const s = x.replace(/"/g, \'\'); const t = "Maison";')).toEqual(['Maison']);
    expect(ts("const r = /[/']/; const t = 'Maison';")).toEqual(['Maison']);
    expect(ts("const q = a / b; const t = 'Maison' + c / d;")).toEqual(['Maison']);
    expect(ts("if (/^fr\\b/i.test(l)) return 'Réglages';")).toEqual(['Réglages']);
  });
  it('finds accent-free French outside the old word list', () => {
    expect(ts("const a = 'Retour aux pieces';")).toEqual(['Retour aux pieces']);
    expect(ts("const a = 'non relie';")).toEqual(['non relie']);
    expect(ts("const a = 'Semaine';")).toEqual(['Semaine']);
    expect(ts("const a = 'HC 42 %';")).toEqual(['HC 42 %']);
    expect(ts('const a = `${x}${NB}: ${y}`;')).toEqual([':']); // a no-break space before « : » is French typography
    expect(svelte('<p>Simulateur&nbsp;: démo</p><p>Total&nbsp;: 3</p>')).toEqual(['Simulateur&nbsp;: démo', 'Total&nbsp;: 3']);
    expect(ts("const a = 'l’accord';")).toEqual(['l’accord']);
  });
  it('common imperatives, short labels, escapes and entities (batch-6 review minor 3)', () => {
    for (const w of ['Valider', 'Actualiser', 'Modifier', 'Confirmer', 'Continuer', 'Appliquer', 'Date de fin', 'Hors ligne']) {
      expect(ts(`const a = '${w}';`), w).toEqual([w]);
    }
    expect(ts("const a = 'Pi\\u00e8ces';")).toHaveLength(1);
    expect(ts("const a = 'Total\\u00a0: 3';")).toHaveLength(1);
    expect(ts("const a = 'Pi\\xe8ces';")).toHaveLength(1);
    expect(svelte('<p>Pi&egrave;ces</p>')).toHaveLength(1);
    expect(svelte('<p>Total&#xa0;: 3</p>')).toHaveLength(1);
    expect(svelte('<p>l&#8217;accord</p>')).toHaveLength(1);
    expect(svelte('<p>&laquo; x &raquo;</p>')).toHaveLength(1);
    // Still English: an escaped apostrophe in a contraction, a lone no-break space.
    expect(ts("const a = 'Can\\u2019t reach Kelvin.'; const NB = '\\u00a0';")).toEqual([]);
    expect(svelte('<p>Can&rsquo;t reach Kelvin&nbsp;—</p>')).toEqual([]);
  });
  it('English copy and data values are not French', () => {
    expect(ts("const a = 'Can’t reach Kelvin. Check your connection.'; const b = 'the home’s radiators’ meters';")).toEqual([]);
    expect(ts("const a = 'No figure in the absence of a curve.';")).toEqual([]);
    expect(ts("if (mode === 'programme') x(); switch (k) { case 'programme': break; }")).toEqual([]);
    expect(ts("const k = ['hc', 'hp']; const c = 'hc_kwh';")).toEqual([]);
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

describe('frozenMessages', () => {
  it('flags a module-level const that reads a message, not a getter or a derived', () => {
    expect(frozenMessages("export const LABELS = [m.nav.rooms, m.nav.home];", false).map((f) => f.line)).toEqual([1]);
    expect(frozenMessages("const t = m.common.cancel;", false)).toHaveLength(1);
    expect(frozenMessages("const t = () => m.common.cancel;", false)).toEqual([]);
    expect(frozenMessages("function f() {\n  const t = m.common.cancel;\n}", false)).toEqual([]);
    expect(frozenMessages("<script>\n  const t = m.common.cancel;\n  let u = $derived(m.common.cancel);\n</script>", true).map((f) => f.line)).toEqual([2]);
  });
  it('sees let and var, multi-line initialisers, callbacks run now and $state (batch-6 review I1)', () => {
    const lines = (src: string, svelte = false) => frozenMessages(src, svelte).map((f) => f.line);
    expect(lines('let frozenLet = m.common.close;')).toEqual([1]);
    expect(lines('var v = m.common.close;')).toEqual([1]);
    expect(lines('const LABELS = {\n  a: m.nav.rooms\n};\nconst x = 1;')).toEqual([1]);
    expect(lines('export const LABELS = [\n  m.nav.rooms\n];')).toEqual([1]);
    expect(lines('const t =\n  m.common.cancel;')).toEqual([1]);
    expect(lines('const LABELS = KEYS.map((k) => m.nav[k]);')).toEqual([1]);
    expect(lines('<script>\n  let x = $state(m.common.cancel);\n</script>', true)).toEqual([2]);
    // Getters stay fine, however they are written.
    expect(lines('const f = (n: number) => m.rooms.count(n);')).toEqual([]);
    expect(lines('const f = async () =>\n  m.common.cancel;')).toEqual([]);
    expect(lines('const f = function () {\n  return m.common.cancel;\n};')).toEqual([]);
    expect(lines('const L: Record<string, () => string> = { a: () => m.nav.rooms };')).toEqual([]);
    expect(lines('const LABELS = KEYS.map((k) => () => m.nav[k]);')).toEqual([]);
    expect(lines('<script>\n  let n = $derived<Record<string, string>>(a ? { x: m.nav.home } : {});\n</script>', true)).toEqual([]);
    expect(lines('<script>\n  let u = $derived.by(() => m.nav.home);\n  const k = [\n    \'a\'\n  ];\n</script>', true)).toEqual([]);
  });
});

/** Parents whose children are read by index (m.mode[mode]); a key under one counts as used. */
export const DYNAMIC = [
  // Maison › Tarif (UX batch 9): m.tariffSummary.options[row.option]
  'tariffSummary.options',
  'devices.problem',
  'devices.detail',
  'devices.role',
  // Plan 12: read by index (m.support[shown], m.pilot[KEY[level]], m.dryer[state]); `kind` by the device screen (Task 17)
  'kind',
  'support',
  'pilot',
  'dryer',
  'api',
  'action',
  'cozytouch',
  'error',
  'mode',
  'level',
  'nav',
  'days',
  'daysShort',
  'range',
  'program.dayError',
  'program.presets',
  'energy.views',
  'energyPage.unit',
  'inspector.rateLabels',
  'compare.avg4',
  'compare.noUnits',
  'projection.method',
  'quality.mark',
  'quality.method',
  'settings.themes',
  'grid.colour',
  'tariff.options',
  'tariff.rate',
  'tariff.rateShort',
  'home.kind',
  // UX foundation: read by index (m.prov.natures[nature])
  'prov.natures'
];

const SRC = resolve(process.cwd(), 'src');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.(svelte|ts)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

describe('the web source (strict)', () => {
  const files = sources(SRC);
  it('has no hard-coded French outside the dictionaries', () => {
    expect(scanFiles([SRC], SRC)).toEqual([]);
  });
  it('reads every dictionary key somewhere', () => {
    const corpus = files.filter((f) => !/lib\/i18n\/(fr|en)\.ts$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(unusedKeys(flattenKeys(fr), corpus, DYNAMIC)).toEqual([]);
  });
  it('never resolves a message at module scope', () => {
    // Same targets as the CLI: the dictionaries and the i18n core are the place messages are defined.
    const found = files.filter((f) => !/lib[\\/]i18n[\\/]/.test(f)).flatMap((f) =>
      frozenMessages(readFileSync(f, 'utf8'), f.endsWith('.svelte')).map((x) => `${f.slice(SRC.length + 1)}:${x.line}: ${x.text}`)
    );
    expect(found).toEqual([]);
  });
});
