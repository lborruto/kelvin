// Finds user-facing French left in the web source, and dictionary keys nothing reads.
// Plan 7: report mode inventories strings (Phase 0); --strict fails CI (Phase 6, also run by vitest).
// Usage: node scripts/i18n-check.mjs [--strict] [dir-or-file …]   (default: src)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRENCH_LETTERS = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ’«»]/;
// Accent-free French UI words (and a few phrases). Keep it to words English copy never uses.
const WORDS = [
  'absence', 'abonnement', 'ajouter', 'aller', 'annuler', 'appel', 'appels', 'augmenter', 'aucun', 'aucune',
  'aujourd', 'avant', 'chargement', 'chauffage', 'choisissez', 'clair', 'clignoter', 'collez', 'commande',
  'compte', 'compteurs', 'confort', 'connecter', 'connexion', 'consentement', 'consigne', 'consommation',
  'contenu', 'copier', 'courbe', 'cours', 'creuses', 'depuis', 'dimanche', 'diminuer', 'du', 'enregistrer',
  'enregistrement', 'envoi', 'envoyer', 'erreur', 'estimation', 'fermer', 'forcer', 'gel', 'heure', 'heures', 'historique',
  'ignorer', 'inattendue',
  'il y a', 'indiquez', 'injoignable', 'jeton', 'jeudi', 'jour', 'jours', 'jusqu', 'laissez', 'langue',
  'lundi', 'maison', 'manuel', 'mardi', 'mercredi', 'mixte', 'mois', 'modifications', 'mot de passe', 'pas',
  'plage', 'plages', 'pleines', 'pour',
  'principale', 'programme', 'projection', 'puissance', 'radiateur', 'radiateurs', 'reconnecter',
  'reconnexion', 'renommer', 'repos', 'retirer', 'saisissez', 'samedi', 'sans', 'simulateur', 'sombre', 'souscrite',
  'tarif', 'tout', 'utilisez', 'vendredi', 'vers', 'veilleuse', 'vous'
];
export const FRENCH_WORDS = new RegExp(`\\b(${WORDS.join('|')})\\b`, 'i');

// A literal right after one of these is an identifier, a path or a module, never copy.
const SKIP_BEFORE =
  /(?:class|data-testid|id|href|src|name|rel|type|autocomplete|inputmode|lang|for|role|aria-controls|aria-describedby|aria-labelledby)=\s*$|(?:from|import)\s*$/;
const EXCLUDED = [/(^|\/)lib\/i18n\//, /\.test\.ts$/, /\.d\.ts$/, /(^|\/)test-setup\.ts$/];

/** @param {string} s */
const blank = (s) => s.replace(/[^\n]/g, ' ');

/**
 * French found in one file's source.
 * @param {string} text
 * @param {boolean} svelte
 * @returns {{ line: number; text: string }[]}
 */
export function scanSource(text, svelte) {
  // Marked lines first: their marker is itself a comment, stripped just below.
  let src = text
    .split('\n')
    .map((l) => (l.includes('i18n-ignore') ? blank(l) : l))
    .join('\n')
    // The legacy French paths table (lib/paths.ts) is data, not copy.
    .replace(/\/\* legacy-paths:start[\s\S]*?legacy-paths:end \*\//g, blank);
  if (svelte) src = src.replace(/<style[\s\S]*?<\/style>/g, blank);
  src = src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/gm, (m, p) => p + blank(m.slice(p.length)));
  /** @type {{ index: number; text: string }[]} */
  const found = [];
  for (const m of src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    const index = m.index ?? 0;
    if (SKIP_BEFORE.test(src.slice(Math.max(0, index - 40), index))) continue;
    const body = m[0].slice(1, -1);
    found.push({ index, text: body.replace(/\$\{[^}]*\}/g, ' ') });
    // Literals nested in a template's ${…} (`${x ?? 'échec'}`) are copy too.
    if (m[0][0] === '`') {
      for (const e of body.matchAll(/\$\{([^}]*)\}/g)) {
        for (const inner of scanSource(e[1], false)) found.push({ index: index + 1 + (e.index ?? 0), text: inner.text });
      }
    }
  }
  if (svelte) {
    let markup = src.replace(/<script[\s\S]*?<\/script>/g, blank);
    for (let i = 0; i < 3; i++) markup = markup.replace(/\{[^{}]*\}/g, blank);
    for (const m of markup.matchAll(/>([^<>]+)</g)) found.push({ index: (m.index ?? 0) + 1, text: m[1] });
  }
  return found
    .filter((f) => FRENCH_LETTERS.test(f.text) || FRENCH_WORDS.test(f.text))
    .sort((a, b) => a.index - b.index)
    .map((f) => ({ line: src.slice(0, f.index).split('\n').length, text: f.text.trim().replace(/\s+/g, ' ') }));
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function files(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((n) => files(join(path, n)));
}

/**
 * @param {string[]} roots
 * @param {string} base
 * @returns {{ file: string; line: number; text: string }[]}
 */
export function scanFiles(roots, base) {
  return roots
    .flatMap(files)
    .filter((f) => /\.(svelte|ts)$/.test(f))
    .map((f) => ({ f, file: relative(base, f).split(sep).join('/') }))
    .filter(({ file }) => !EXCLUDED.some((r) => r.test(file)))
    .flatMap(({ f, file }) => scanSource(readFileSync(f, 'utf8'), f.endsWith('.svelte')).map((x) => ({ file, ...x })));
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flattenKeys(/** @type {Record<string, unknown>} */ (v), `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

/**
 * Keys no source reads as `m.<path>`; a key under a dynamic parent (`m.mode[mode]`) counts as used.
 * @param {string[]} keys
 * @param {string} corpus
 * @param {string[]} dynamic
 * @returns {string[]}
 */
export function unusedKeys(keys, corpus, dynamic) {
  return keys.filter(
    (k) =>
      !dynamic.some((d) => k === d || k.startsWith(`${d}.`)) &&
      !new RegExp(`\\bm\\.${k.replace(/\./g, '\\.')}(?!\\w)`).test(corpus)
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const web = fileURLToPath(new URL('..', import.meta.url));
  const roots = args.filter((a) => !a.startsWith('--'));
  const found = scanFiles((roots.length ? roots : ['src']).map((r) => join(web, r)), join(web, 'src'));
  for (const x of found) console.log(`${x.file}:${x.line}: ${x.text}`);
  console.log(`${found.length} hard-coded French string(s)`);
  if (args.includes('--strict') && found.length) process.exit(1);
}
