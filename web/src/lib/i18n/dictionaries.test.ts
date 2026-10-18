import { describe, expect, it } from 'vitest';
import { isFrench } from '../../../scripts/i18n-check.mjs';
import codes from './api-codes.json';
import { en } from './en';
import { fr } from './fr';

type Fn = (...a: unknown[]) => unknown;
const ERRORS = codes.errors as Record<string, { params: Record<string, unknown> }>;
const LABELS = codes.labels as Record<string, { params: Record<string, unknown> }>;

/** Sample arguments for messages whose parameters are not (number, string, string, …): a day key,
 * a list, an object. A task that adds such a message adds its line here. */
export const ARGS: Record<string, unknown[]> = {
  'energyUi.linkyCallsValue': [2, 10],
  'away.offline': [['Chambre 2'], 1],
  'pending.partial': ['B', 2, 1],
  'devices.syncAt': ['14:10'],
  'maison.allOffOffline': [['Chambre 2'], 1],
  'maison.climateHeating': ['19,1–19,6°', 1],
  'maison.roomsSummary': [1, 1, false],
  'maison.ecowatt': [1],
  'maison.billDays': [16, 31],
  'maison.billProgress': [16, 31],
  'maison.ecowattTense': ['18:00–20:00', 2],
  'roomSheet.noReading': ['04:07', 1],
  'maison.awayEveryBut': [['Chambre 2']],
  'maison.billTitle': ['Octobre', 15],
  'roomSheet.month': [15],
  'home.cardDevices': [2, 3],
  'devices.done': ['Salon'],
  'devices.lastSignal': ['12:10'],
  'devices.detailsOf': ['Hekla'],
  'devices.deleteTitle': ['Bureau'],
  'devices.moveTitle': ['R1'],
  'devices.syncedAgo': ['12:10'],
  'devices.budget': [1, 3],
  'devices.dailyAt': ['04:30'],
  'devices.spent': ['14:10'],
  'devices.atTime': ['14:10'],
  'devices.onDate': ['15/10 08:00'],
  'devices.watts': ['1 500'],
  'tariff.prefill': ['6', '22:00–06:00'],
  'tariff.contractNew': ['23:00–07:00'],
  'tariff.kvaValue': [9],
  'tariff.tempoPrefillNote': ['14 octobre 2026'],
  'tariff.season': [1],
  'tariff.slotStart': [1],
  'tariff.slotEnd': [1],
  'tariff.removeSlotLabel': [1],
  'tariff.contractAdd': ['1/12'],
  'tariff.monthsMissing': ['avril'],
  'tariff.monthsOverlap': ['janvier'],
  'linky.ok': ['12/10'],
  'alerts.linkyStalled': ['10/10', 4],
  'alerts.tempoRedTomorrow': ['2/12'],
  'alerts.ecowatt': [2, '2/12', null],
  'alerts.hcChanged': ['23:00–07:00'],
  'linky.quota': ['12/10'],
  'linky.throttledAt': ['12/10', '14:30'],
  'linky.throttledLater': ['12/10'],
  'linky.calls': [3, 10],
  'strip.summary': [['a', 'b']],
  'roomChart.spoken': ['14:00–14:15', ['a', 'b']],
  'status.someOffline': [1, 2],
  'radiator.facts': ['HEKLA P', 1500],
  'program.whenOn': ['monday', '06:15'],
  'program.copyTitle': ['thursday'],
  'program.list': [['06:30–08:00', '12:00–14:00', '17:00–23:00']],
  'program.duration': [7, 30],
  'inspector.radMeasured': [1, 2],
  'inspector.rates': [[['a', '1'], ['b', '2']]],
  'roomEnergy.roomFrom': [1, 2, '7/10'],
  'roomEnergy.roomPartial': [1, 2],
  'roomEnergy.statsOf': [1, 3],
  'hero.compare': ['C1', 'P', 12],
  'compare.tooFew': [9, 13],
  'heatingPanel.days': [3, 12],
  'heatingPanel.unmeasured': [true],
  'heatingPanel.partial': ['P', true],
  'hero.radPartial': ['P', true],
  'compare.zero': ['day'],
  'power.floorDay': ['K', 'E'],
  'projection.base': ['V', '12/10'],
  'grid.ecowatt': [3, 'B', null],
  'sources.ok': ['07:15'],
  'sources.error': ['08:15'],
  'sources.med': [6, 10, 2],
  'energyTariff.days': [{ blue: 3, white: 1, red: 0, unknown: 1 }],
  'energyTariff.daysLine': ['x'],
  'energyTariff.redDays': [1],
  'energyTariff.notCounted': [2],
  'energyTariff.withColour': ['B', 'C'],
  'energyTariff.unknownKwh': ['18\u00a0kWh'],
  'energyTariff.qualityColours': [3],
  'energyTariff.qualityRetro': [5],
  // Plan 12
  'login.leadServer': ['Flexom'],
  'roomCaps.partial': [2, 3],
  'devices.introExperimental': ['Flexom'],
  // UX foundation
  'nav.alerts': ['X', 2],
  'banner.kelvinDown': [3, '21:14'],
  'prov.withMethod': ['A', 'B'],
  // Batch 12: the day before « vers »
  'boost.thenProgram': ['00:19', 'tomorrow'],
  // Plan 14: a temperature, a time and whether it is still ahead; an optional DJU figure
  'weather.atTime': ['1,9\u00a0°C', '06:00', false],
  'weather.heroLine': ['7,9\u00a0°C', null],
  'weather.model': ['9,8', '1,9', 118, '0,81', '312', '268'],
  // Plan 15: an optional €; a figure and whether it was estimated
  'weatherCost.why.few_days': [12, 28],
  'weatherCost.shareSub': ['octobre', 17],
  'weatherCost.fitDays': [301, 9, 4, 15],
  'weatherCost.week': ['€57.60', '€44.01', 7],
  'weatherCost.coverage': [41, 60],
  'weatherCost.projDetail': ['398\u00a0kWh', '427\u00a0kWh', 2, 7, 9],
  'weatherCost.baseloadSub': [null],
  'weatherCost.perDegreeSub': [null],
  'weatherCost.balanceValue': ['15,5\u00a0°C', true],
  'weatherCost.whereDetail': ['0,8\u00a0kWh', null, 41, 60]
};

/** Messages allowed to read the same in both languages (proper nouns, symbols, brand). */
export const SAME = new Set<string>([
  // Programme (Tableau batch): « S » is Saturday (and Sunday) in both languages
  'daysLetter.saturday', 'program.dayReason',
  // Maison (Tableau): a date and a time, a range, arrows to a time, « Total », « Tempo Bleu », « ≈ 3,40 € »
  'maison.dateLine', 'maison.climateRange', 'maison.nextAt', 'maison.arrowAt', 'maison.arrowLevel', 'maison.billTotal', 'maison.tempo',
  'maison.yesterdayEur',
  // Batch 13: « ≈ 1,70 kW » and « Total » read the same in both languages
  'room.livePower', 'room.livePowerTotal',
  'energyUi.keyName', 'energyUi.barView', 'energyUi.roomKwhName',
  'account.email', 'devices.syncAt', 'tariffSummary.option', 'tariffSummary.options.base', 'tariffSummary.options.tempo', 'tariffSummary.unit',
  'devices.watts', 'devices.detail.version', 'devices.detail.rssi', 'devices.role.wifi',
  'page.title', 'range.day', 'radiator.facts', 'inspector.est', 'inspector.eurWord',
  'heatingPanel.est', 'compare.range', 'power.range', 'projection.range', 'projection.approx', 'quality.mark.none',
  'curve.est', 'curvePanel.est', 'roomDay.wh', 'roomDay.degrees', 'roomDay.withWhy', 'roomsEnergy.est',
  'roomInfo.watts', 'roomInfo.rssi', 'roomFigures.est',
  'tariff.kvaValue', 'tariff.options.base', 'tariff.options.tempo', 'tariff.rateShort.base',
  'energyTariff.colKwh', 'energyTariff.colEur', 'energyTariff.withColour',
  // The outdoor line over Énergie's charts: units and a degree tick read the same
  'outdoorLine.unitTemp', 'outdoorLine.unitWh', 'outdoorLine.tick',
  'sources.title',
  // Plan 12: a product name
  'servers.cozytouch', 'dryer.normal',
  // UX foundation: source names (products), « Code », « Source », « est. »
  'page.code', 'prov.source', 'prov.linky', 'prov.rte', 'prov.tempo', 'prov.cozytouch', 'prov.withMethod', 'fiche.est',
  // Plan 13: product names and a token's last four characters
  'mcp.defaultName', 'mcp.claudeCode', 'mcp.hint',
  // The room chart's inspector: times, a date and a time, a label and its value, « Minimum » / « Maximum »
  'roomChart.span', 'roomChart.dated', 'roomChart.part', 'roomChart.partWhy', 'roomChart.min', 'roomChart.max',
  // Plan 14: model names (proper nouns), « Minimum », « Latitude », « Altitude », a figure and its origin
  'prov.weather.arome_hd', 'prov.weather.arpege', 'weather.min', 'weather.max', 'weather.lat', 'weather.lon',
  'weather.elevationRow', 'weather.elevationValue',
  // Plan 15: a model name (proper noun), « ~6,28 € », « Salon +0,8 kWh »
  'prov.weather.ecmwf', 'weatherCost.cell', 'weatherCost.whereItem', 'weatherCost.unitKwh', 'weatherCost.unitEur'
]);

function leaves(o: object, prefix = ''): [string, unknown][] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]]
  );
}

function render(path: string, v: unknown): string {
  if (typeof v === 'string') return v;
  const [group, ...rest] = path.split('.');
  const key = rest.join('.');
  const args =
    group === 'api' ? [ERRORS[key]?.params ?? {}] : group === 'action' ? [LABELS[key]?.params ?? {}] : (ARGS[path] ?? [2, 'B', 'C', 'D']);
  const out = (v as Fn)(...args);
  return typeof out === 'string' ? out : JSON.stringify(out);
}

const FR = leaves(fr).map(([p, v]) => [p, render(p, v)] as const);
const EN = new Map(leaves(en).map(([p, v]) => [p, render(p, v)]));

describe('dictionaries', () => {
  it('have the same keys', () => {
    // Same set of keys; group order inside the files is free.
    expect([...EN.keys()].sort()).toEqual(FR.map(([p]) => p).sort());
  });
  it('every message renders to real text', () => {
    for (const [p, t] of [...FR, ...EN]) {
      expect(t.length, p).toBeGreaterThan(0);
      expect(t, p).not.toMatch(/undefined|NaN|\[object/);
    }
  });
  it('English is not French left behind', () => {
    for (const [p, t] of FR) if (!SAME.has(p)) expect(EN.get(p), p).not.toBe(t);
  });
  it('French typography: ’, no-break space before units, % € and before : ; ? !, inside « »', () => {
    for (const [p, t] of FR) {
      expect(t, p).not.toMatch(/'/);
      expect(t, p).not.toMatch(/ [:;?!]/);
      expect(t, p).not.toMatch(/\d (?=°C|kWh|Wh\b|W\b|kVA\b|%|€)/);
      expect(t, p).not.toMatch(/« | »/);
    }
  });
  it('English typography: ’, no « », no-break space before °C and kWh, 42%, €16.20, never HC/HP', () => {
    for (const [p, t] of EN) {
      expect(t, p).not.toMatch(/['«»]/);
      expect(t, p).not.toMatch(/\d (?=°C|kWh|Wh\b|W\b|kVA\b)/);
      expect(t, p).not.toMatch(/\d[\s\u00a0]%|\d[\s\u00a0]?€/);
      expect(t, p).not.toMatch(/\bH[CP]\b|\blog ?in\b/i);
    }
  });
});

/** A function's parameter names, read from its source (arrow or plain function). */
function params(fn: Fn): string[] {
  const src = fn.toString();
  const m = /^(?:function[^(]*)?\(([^)]*)\)|^([\w$]+)\s*=>/.exec(src);
  const list = m ? (m[1] ?? m[2] ?? '') : '';
  return list
    .split(',')
    .map((s) => s.replace(/[=:].*$/s, '').trim())
    .filter(Boolean);
}

/** Every way `other`'s messages differ from `ref`'s: a missing or extra function, another arity,
 * other parameter names. Empty when they match. */
function paramMismatches(ref: object, other: object): string[] {
  const fns = (o: object) => new Map(leaves(o).filter(([, v]) => typeof v === 'function') as [string, Fn][]);
  const a = fns(ref);
  const b = fns(other);
  const out: string[] = [];
  for (const [p, f] of a) {
    const g = b.get(p);
    if (!g) out.push(`${p}: missing`);
    else if (g.length !== f.length) out.push(`${p}: arity ${g.length} ≠ ${f.length}`);
    else if (params(g).join() !== params(f).join()) out.push(`${p}: (${params(g)}) ≠ (${params(f)})`);
  }
  for (const p of b.keys()) if (!a.has(p)) out.push(`${p}: extra`);
  return out;
}

describe('English messages take the same parameters as French', () => {
  it('same functions, same arity and the same parameter names', () => {
    expect(leaves(fr).some(([, v]) => typeof v === 'function')).toBe(true);
    expect(paramMismatches(fr, en)).toEqual([]);
  });
  it('the check notices a dropped, renamed, missing or extra parameter or message', () => {
    const ref = { g: { a: (n: number, s: string) => `${n}${s}`, b: (x: string) => x } };
    expect(paramMismatches(ref, { g: { a: (n: number) => `${n}`, b: (x: string) => x } })).toEqual(['g.a: arity 1 ≠ 2']);
    expect(paramMismatches(ref, { g: { a: (n: number, t: string) => `${n}${t}`, b: (x: string) => x } })).toEqual([
      'g.a: (n,t) ≠ (n,s)'
    ]);
    expect(paramMismatches(ref, { g: { a: (n: number, s: string) => `${n}${s}` } })).toEqual(['g.b: missing']);
    expect(paramMismatches(ref, { g: { ...ref.g, c: (y: string) => y } })).toEqual(['g.c: extra']);
    expect(paramMismatches(ref, ref)).toEqual([]);
  });
});

/** French the strict scanner cannot tell from English or code, so a hard-coded copy of it would
 * slip through: short forms that are English words or names, a bare figure. Kept small on purpose. */
const SCANNER_BLIND = new Set([
  // Plan 15: « Par °C plus froid », « Dehors », « absence », « Fourchette » read as English or symbols
  'weatherCost.perDegree', 'weatherCost.perDegreeSub', 'weatherCost.rowOutside', 'weatherCost.rowPerDegreeEur',
  'weatherCost.excluded.away', 'weatherCost.dayRange', 'weatherCost.roomValue', 'weatherCost.roomRow', 'weatherCost.dayColour',
  // Réglages (Tableau settings batch): « 2 jetons MCP », « brouillon »
  'home.cardMcp',
  'tariff.draft',
  // Programme (Tableau batch): day abbreviations and letters
  'daysAbbr.monday', 'daysAbbr.tuesday', 'daysAbbr.wednesday', 'daysAbbr.thursday', 'daysAbbr.friday', 'daysAbbr.saturday',
  'daysAbbr.sunday', 'daysLetter.monday', 'daysLetter.tuesday', 'daysLetter.wednesday', 'daysLetter.thursday',
  'daysLetter.friday', 'daysLetter.sunday', 'program.bubbleEnd', 'program.lockedShort.unrecognised',
  // Maison and the room sheet (Tableau): short French words and figures the scanner reads as neutral.
  'maison.climate', 'maison.boostLaunch', 'maison.paused', 'maison.awayEnd', 'maison.alerts', 'maison.ecowatt', 'maison.progLastKnown',
  'roomSheet.caption', 'roomSheet.captionPaused', 'roomSheet.now',
  'energyUi.ecowatt', 'energyUi.analysis', 'energyUi.qualityMeta',
  // Maison (UX batch 8): short French words the scanner reads as neutral.
  'tariff.historyMeta', 'linky.show', 'linky.hide',
  'away.extendGo', 'away.extend', 'away.endNow', 'home.stateAlerts', 'home.cardSourcesLate', 'home.display',
  'devices.detail.voltage', 'devices.detail.wifi', 'devices.role.box',
  'modeSwitch.programShort', 'range.week', 'range.month',
  'energy.weekShort',
  'inspector.rates', 'inspector.rateLabels.base',
  'roomInfo.title', 'roomInfo.lastSignal', 'program.reload', 'alerts.title',
  'tariff.option', 'tariff.tempoEnd', 'tariff.season',
  // The room chart's inspector: « Moment », « non »
  'roomChart.when', 'roomChart.heatingNo',
  // Login (Batch 11): « Changer » alone
  'login.change',
  // Batch 12: « En ligne », « Ouvrir Linky »
  'roomInfo.reachable', 'devices.reachable', 'energyPage.settings',
  // Batch 13: « 80 % de 1 500 W », « dernier signal il y a 3 min »
  'room.livePowerRow', 'roomInfo.lastSignalInline',
  // Maison's late alerts: « 2 nouvelles alertes », « Afficher »
  'maison.alertsNew', 'maison.alertsShow',
  // Plan 12: no accent and no listed French word
  'support.expected', 'pilot.label', 'dryer.boost',
  // Programme redesign: figures and short words (« 7 h 30 », « … et … », « Week-end », « Raccourcis »)
  'program.duration', 'program.list', 'program.presets.weekend', 'program.presetsLabel',
  // Pièces redesign: short words in the boost sentence (« pendant », « Lancer », « ex. 22 °C pendant 2 h »)
  'boost.during', 'boost.start', 'boost.meta',
  // UX foundation: short labels (« Adresse », « Nature », « Calcul Kelvin », « Moyenne », « Période »)
  'page.route', 'prov.nature', 'prov.kelvin', 'nav.alerts',
  // Tableau: « Maintenant », « par kWh », « Ensuite »
  'now.title', 'now.perKwh', 'now.nextLabel',
  // Plan 14: « Dehors », « Ressenti », « 2 lieux », « Lieu », « commune », « saisie », « DJU (base 18 °C) », two figures
  'weather.chip', 'strip.legendOutdoor', 'weather.now', 'weather.feelsLike', 'weather.djuLabel', 'weather.results', 'weather.elevation',
  'weather.change', 'weather.place', 'weather.coordsValue', 'weather.elevationFrom.geocoder', 'weather.elevationFrom.owner',
  'weather.elevationFrom.none',
  // The outdoor line over Énergie's charts: « Dehors », « dehors 2,0 °C »
  'outdoorLine.outside', 'outdoorLine.spoken'
]);

/** French proper nouns English copy keeps (docs/glossary.md): removed before the English scan. */
const PROPER_NOUNS = /Météo-France/g;

describe('the strict scanner against the real copy (Task 17)', () => {
  it('reads every French message as French', () => {
    const missed = FR.filter(([p, t]) => !SAME.has(p) && !SCANNER_BLIND.has(p) && !isFrench(t)).map(([p, t]) => `${p}: ${t}`);
    expect(missed).toEqual([]);
  });
  it('never reads an English message as French', () => {
    // Proper nouns English keeps as they are (glossary): « Météo-France » is a name, never translated (Plan 14).
    const flagged = [...EN].filter(([, t]) => isFrench(t.replace(PROPER_NOUNS, ''))).map(([p, t]) => `${p}: ${t}`);
    expect(flagged).toEqual([]);
  });
  it('the blind list holds only messages the scanner really misses', () => {
    expect(FR.filter(([p, t]) => SCANNER_BLIND.has(p) && isFrench(t)).map(([p]) => p)).toEqual([]);
  });
});

describe('the bookkeeping lists name real messages', () => {
  it('every key in ARGS, SAME and SCANNER_BLIND is a message', () => {
    const keys = new Set(leaves(fr).map(([p]) => p));
    const stale = [...Object.keys(ARGS), ...SAME, ...SCANNER_BLIND].filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });
});
