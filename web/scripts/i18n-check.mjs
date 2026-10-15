// Finds user-facing French left in the web source, and dictionary keys nothing reads.
// Plan 7: report mode inventories strings (Phase 0); --strict fails CI (Phase 6, also run by vitest).
// Usage: node scripts/i18n-check.mjs [--strict] [dir-or-file …]   (default: src)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Accented letters and guillemets. The apostrophe ’ is not here: English uses it too (“can’t”);
// French elision (« l’accord ») has its own pattern below.
export const FRENCH_LETTERS = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ«»]/;
// Accent-free French UI words (and a few phrases): the old list plus every accent-free word of
// fr.ts that is neither in en.ts nor an English dictionary word (Plan 7, Task 17). Keep it to
// words English copy never uses; dictionaries.test.ts proves no en.ts message matches.
// Not here on purpose: « absence » (English too; the label is matched case-sensitively below); short forms that are English words or names
// (« Lun », « Mar », « Dim », « Sam », « S42 », « 7 j », « Prog. »); see i18n-check notes in check.test.ts.
const WORDS = [
  'abaissement', 'abandonner', 'abonnement', 'activer', 'actualiser', 'appliquer', 'confirmer', 'continuer', 'date de fin',
  'hors ligne', 'modifier', 'valider', 'ajouter', 'ajoutez', 'ajuster', 'aller', 'annuler', 'appel',
  'appels', 'assez', 'atteint', 'atteinte', 'attente', 'au', 'augmenter', 'aucun', 'aucune', 'aujourd', 'aussi', 'autre',
  'autres', 'aux', 'avant', 'avec', 'barre', 'barres', 'bleu', 'blanc', 'bords', 'celles', 'celui', 'cette', 'chaque',
  'chargement', 'chauffage', 'chauffe', 'chevauchent', 'chiffres', 'choisie', 'choisissez', 'clair', 'clignoter',
  'cliquez', 'collez', 'commande', 'comparaison', 'comparaisons', 'complet', 'compris', 'compte', 'comptent', 'compteur',
  'compteurs', 'confort', 'connecter', 'connexion', 'consentement', 'consigne', 'consommation', 'contenu', 'contrat',
  'copier', 'courbe', 'cours', 'couverture', 'creuse', 'creuses', 'dans', 'demain', 'demande', 'depuis', 'derniers', 'des',
  'deux', 'dimanche', 'diminuer', 'disponible', 'dont', 'du', 'enregistrer', 'enregistrement', 'entier', 'entre', 'envoi',
  'envoyer', 'erreur', 'essai', 'essayez', 'estimation', 'exporter', 'facteur', 'faire', 'fermer', 'fichiers', 'finir',
  'finit', 'fois', 'fonction', 'forcer', 'fuseau', 'futur', 'garantie', 'garder', 'gel', 'glissez', 'graphique', 'heure',
  'heures', 'hier', 'historique', 'ici', 'identique', 'ignorer', 'il y a', 'inattendue', 'inconnu', 'inconnue', 'indiquez',
  'indisponible', 'indisponibles', 'injoignable', 'interne', 'introuvable', 'invalide', 'jeton', 'jeudi', 'jour',
  'journalier', 'jours', 'jusqu', 'juste', 'kilowattheures', 'la', 'laissez', 'langue', 'le', 'les', 'leur', 'leurs',
  'livraison', 'lundi', 'maison', 'manquant', 'manquants', 'manuel', 'mardi', 'mercredi', 'mesure', 'mixte', 'modifications',
  'modifiez', 'moins', 'mois', 'montants', 'mot de passe', 'moy', 'moyen', 'moyenne', 'nouvel', 'nuit', 'ont', 'ouverte',
  'parcourir', 'parmi', 'partie', 'partiel', 'partielle', 'partielles', 'partir', 'pas', 'passent', 'perdue', 'peut',
  'plage', 'plages', 'pleine', 'pleines', 'pointe', 'pour', 'pourrez', 'prend', 'principale', 'prix', 'prochains',
  'programme', 'programmes', 'projection', 'puis', 'puissance', 'quand', 'que', 'quelle', 'radiateur', 'radiateurs',
  'reconnecter', 'reconnectez', 'reconnexion', 'refaites', 'registre', 'relie', 'reliez', 'remettre', 'rempli', 'renommer',
  'renouvelez', 'renseignez', 'reprennent', 'repos', 'requise', 'reste', 'retirer', 'retour', 'rien', 'rouge', 'rythme',
  'saisissez', 'samedi', 'sans', 'selon', 'semaine', 'semaines', 'serveur', 'seule', 'seuls', 'simulateur', 'sinon', 'soit',
  'sombre', 'somme', 'sont', 'sous', 'souscrite', 'suivant', 'suivante', 'supprimer', 'sur', 'survolez', 'synchro',
  'synchronisation', 'talon', 'tard', 'tarif', 'tentatives', 'totale', 'touchez', 'tous', 'tout', 'toute', 'toutes', 'trois',
  'trop', 'ttc', 'une', 'utilisez', 'valable', 'valides', 'veille', 'veilleuse', 'vendredi', 'venir', 'vers', 'vide',
  'vient', 'voir', 'vos', 'votre', 'vous'
];
export const FRENCH_WORDS = new RegExp(`\\b(${WORDS.join('|')})\\b`, 'i');
// Case-sensitive: HC/HP are French abbreviations (English says Off-peak/Peak, glossary; data keys
// are lower case), and « Absence » is the French label for Away (English “absence” is lower case
// mid-sentence, so the word itself is not in WORDS).
const FRENCH_CASED = /\b(?:HC|HP|Absence)\b/;
// French elision (« l’accord », « jusqu’au »), not an English contraction (“can’t”, “home’s”).
const FRENCH_ELISION = /\b(?:c|d|j|l|m|n|s|t|qu|jusqu|lorsqu|puisqu)’(?=\w)/i;
// French typography: a no-break space (or &nbsp;) before : ; ? ! or %. English never has one there.
const FRENCH_PUNCT = /(?:[\u00a0\u202f]|&nbsp;|&#160;)[:;?!%]/;

// Named HTML entities for accented letters (&egrave;) and French punctuation.
const MARKS = { grave: '\u0300', acute: '\u0301', circ: '\u0302', uml: '\u0308', cedil: '\u0327' };
const NAMED = { laquo: '«', raquo: '»', rsquo: '’', nbsp: '\u00a0', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ' };

/**
 * Escapes (\u00e8, \u{e8}, \xe8) and HTML entities (&egrave; &#xa0; &#8217;) as the characters
 * they stand for, so an escaped French string reads as one.
 * @param {string} text
 */
export function decodeEscapes(text) {
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, a, b, c) => String.fromCodePoint(parseInt(a ?? b ?? c, 16)))
    .replace(/&#x([0-9a-fA-F]+);|&#(\d+);/g, (_, h, d) => String.fromCodePoint(h ? parseInt(h, 16) : Number(d)))
    .replace(/&([a-zA-Z])(grave|acute|circ|uml|cedil);/g, (_, l, mk) => (l + MARKS[/** @type {keyof typeof MARKS} */ (mk)]).normalize('NFC'))
    .replace(/&([a-zA-Z]+);/g, (e, n) => NAMED[/** @type {keyof typeof NAMED} */ (n)] ?? e);
}

/**
 * Whether a piece of copy reads as French.
 * @param {string} raw
 */
export function isFrench(raw) {
  const text = decodeEscapes(raw);
  return (
    FRENCH_LETTERS.test(text) ||
    FRENCH_WORDS.test(text) ||
    FRENCH_CASED.test(text) ||
    FRENCH_ELISION.test(text) ||
    FRENCH_PUNCT.test(text)
  );
}

// A literal right after one of these is an identifier, a path, a module or a data value (a
// comparison or a case label), never copy. The attribute name must start the word, so
// aria-invalid= is not read as id=.
const SKIP_BEFORE =
  /(?:^|[^\w-])(?:class|data-testid|id|href|src|name|rel|type|autocomplete|inputmode|lang|for|role|aria-controls|aria-describedby|aria-labelledby)=\s*$|(?:from|import)\s*$|[!=]==?\s*$|\bcase\s+$/;
const EXCLUDED = [/(^|\/)lib\/i18n\//, /\.test\.ts$/, /\.d\.ts$/, /(^|\/)test-setup\.ts$/];

/** @param {string} s */
const blank = (s) => s.replace(/[^\n]/g, ' ');

// After one of these tokens a `/` starts a regex literal; after anything else it divides.
const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|void|delete|new|throw|yield|await))\s*$/;

/**
 * Script code with the body of every regex literal blanked, so a quote inside one (/'/) never
 * starts a string. Strings, templates and comments are walked over, never changed.
 * @param {string} code
 */
export function blankRegexLiterals(code) {
  let out = '';
  let i = 0;
  /** Brace depth of each open template's ${…}; inside one, code rules apply. */
  const tpl = [];
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      out += code.slice(i, j + 1);
      i = j + 1;
    } else if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === 0)) {
      if (c === '}') tpl.pop();
      let j = i + 1;
      while (j < code.length && code[j] !== '`' && !(code[j] === '$' && code[j + 1] === '{')) j += code[j] === '\\' ? 2 : 1;
      if (code[j] === '$') {
        tpl.push(0);
        j += 1;
      }
      out += code.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && code[i + 1] === '/') {
      const j = code.indexOf('\n', i);
      const end = j < 0 ? code.length : j;
      out += code.slice(i, end);
      i = end;
    } else if (c === '/' && code[i + 1] === '*') {
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? code.length : j + 2;
      out += code.slice(i, end);
      i = end;
    } else if (c === '/' && REGEX_AFTER.test(out.slice(-40))) {
      let j = i + 1;
      let cls = false;
      while (j < code.length && code[j] !== '\n' && (cls || code[j] !== '/')) {
        if (code[j] === '\\') j += 1;
        else if (code[j] === '[') cls = true;
        else if (code[j] === ']') cls = false;
        j += 1;
      }
      out += '/' + blank(code.slice(i + 1, j)) + (code[j] === '/' ? '/' : '');
      i = code[j] === '/' ? j + 1 : j;
    } else {
      if (tpl.length && c === '{') tpl[tpl.length - 1] += 1;
      if (tpl.length && c === '}') tpl[tpl.length - 1] -= 1;
      out += c;
      i += 1;
    }
  }
  return out;
}

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
  // Regex literals before anything reads quotes: in a whole .ts file, in a component's scripts.
  src = svelte
    ? src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (_, a, b, c) => a + blankRegexLiterals(b) + c)
    : blankRegexLiterals(src);
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
    // ${NB} is the dictionaries' no-break space: keep it, it marks French typography (« 42${NB}% »).
    found.push({ index, text: body.replace(/\$\{NB\}/g, '\u00a0').replace(/\$\{[^}]*\}/g, ' ') });
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
    .filter((f) => isFrench(f.text))
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
 * The sources the frozen-message check reads: components and modules, not tests or dictionaries.
 * @param {string[]} roots
 * @returns {string[]}
 */
function scanTargets(roots) {
  return roots.flatMap(files).filter((f) => /\.(svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !/lib[\\/]i18n[\\/]/.test(f));
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

/**
 * Messages read once at module scope (or at the top of a component script) keep the language
 * they were read in: label arrays must hold keys or getters, resolved in templates or $derived.
 * A declaration (const, let or var, over as many lines as it takes) is frozen when its
 * initialiser reads `m.<key>` where the read runs now: not inside a stored arrow or function
 * (the initialiser itself, an object or array element, an arrow returned by another one), not
 * inside $derived / $derived.by. An arrow passed straight to a call (`KEYS.map((k) => m.nav[k])`)
 * runs now, and so does `$state(m.…)`.
 * @param {string} text
 * @param {boolean} svelte
 * @returns {{ line: number; text: string }[]}
 */
export function frozenMessages(text, svelte) {
  const start = svelte ? /^ {2}(?:export )?(?:const|let|var)\s+[\w$]/ : /^(?:export )?(?:const|let|var)\s+[\w$]/;
  /** @type {{ line: number; text: string }[]} */
  const out = [];
  const lines = text.split('\n');
  let inScript = !svelte;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (svelte && /<script\b/.test(l)) inScript = true;
    if (svelte && /<\/script>/.test(l)) inScript = false;
    if (!inScript || !start.test(l)) continue;
    // The whole statement: until brackets balance and the line does not end mid-expression.
    let stmt = codeOnly(l);
    let j = i;
    while (j + 1 < lines.length && (depth(stmt) > 0 || /(?:[=(\[{,?:+|&]|=>)\s*$/.test(stmt))) {
      if (svelte && /<\/script>/.test(lines[j + 1])) break;
      stmt += '\n' + codeOnly(lines[++j]);
    }
    const init = initialiser(stmt);
    if (init !== null && readsNow(init)) out.push({ line: i + 1, text: l.trim() });
    i = j;
  }
  return out;
}

/** A line with string contents and comments blanked (templates kept: their ${…} is code). @param {string} l */
function codeOnly(l) {
  return l
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (s) => s[0] + ' '.repeat(s.length - 2) + s[0])
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '');
}

/** @param {string} s */
function depth(s) {
  let d = 0;
  for (const c of s) d += '([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0;
  return d;
}

/** The text after the declaration's own `=` (past a type annotation such as `Record<K, () => V>`). @param {string} stmt */
function initialiser(stmt) {
  let d = 0;
  for (let k = 0; k < stmt.length; k++) {
    const c = stmt[k];
    if ('([{<'.includes(c)) d++;
    else if (')]}'.includes(c) || (c === '>' && stmt[k - 1] !== '=')) d--;
    else if (c === '=' && d === 0 && stmt[k + 1] !== '=' && stmt[k + 1] !== '>' && !'=!<>'.includes(stmt[k - 1])) return stmt.slice(k + 1);
  }
  return null;
}

/** Whether `init` reads a message at evaluation time. @param {string} init */
function readsNow(init) {
  /** One frame per open bracket: is it a call's argument list, does it defer its contents, has its
   * current element already seen an arrow (a later arrow is that arrow's returned body). */
  const frames = [{ call: false, deferring: false, arrowSeen: false, deferredFrom: -1 }];
  const deferredAt = () => frames.some((f) => f.deferring || f.deferredFrom >= 0);
  for (let k = 0; k < init.length; k++) {
    const c = init[k];
    const f = frames[frames.length - 1];
    if (c === '(' || c === '[' || c === '{') {
      // Type arguments (`$derived<Record<string, string>>(…)`) do not change what the call is.
      const before = init.slice(0, k).replace(/([\w$])\s*<[^()=;]*>\s*$/, '$1');
      const call = c === '(' && /[\w$)\]]\s*$/.test(before) && !/\bfunction\s*[\w$]*\s*$/.test(before);
      frames.push({ call, deferring: call && /\$derived(?:\.by)?\s*$/.test(before), arrowSeen: false, deferredFrom: -1 });
    } else if (c === ')' || c === ']' || c === '}') {
      if (frames.length > 1) frames.pop();
    } else if (c === ',') {
      f.arrowSeen = false;
      f.deferredFrom = -1;
    } else if (c === '=' && init[k + 1] === '>') {
      // An arrow straight in a call's argument list runs now; anywhere else it is stored.
      if (!(f.call && !f.arrowSeen)) f.deferredFrom = k;
      f.arrowSeen = true;
    } else if (/\bfunction\b/y.test(init.slice(k, k + 9)) && /(?:^|[^\w$])$/.test(init.slice(0, k))) {
      if (!f.call) f.deferredFrom = k;
    } else if (c === 'm' && /^m\.[a-zA-Z]/.test(init.slice(k, k + 3)) && !/[\w$.]$/.test(init.slice(0, k)) && !deferredAt()) {
      return true;
    }
  }
  return false;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const web = fileURLToPath(new URL('..', import.meta.url));
  const roots = args.filter((a) => !a.startsWith('--'));
  const found = scanFiles((roots.length ? roots : ['src']).map((r) => join(web, r)), join(web, 'src'));
  for (const x of found) console.log(`${x.file}:${x.line}: ${x.text}`);
  console.log(`${found.length} hard-coded French string(s)`);
  const frozen = scanTargets((roots.length ? roots : ['src']).map((r) => join(web, r))).flatMap((f) =>
    frozenMessages(readFileSync(f, 'utf8'), f.endsWith('.svelte')).map((x) => `${relative(web, f)}:${x.line}: ${x.text}`)
  );
  for (const x of frozen) console.log(`frozen message: ${x}`);
  if (args.includes('--strict') && (found.length || frozen.length)) process.exit(1);
}
