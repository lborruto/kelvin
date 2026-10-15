// Fails on any French URL path or anchor outside the legacy blocks (Plan 7, spec §4 "Paths").
// Usage: node scripts/check-paths.mjs   (from web/; scans the whole repository)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEGMENTS = 'pieces|programme|energie|maison';
const IDS = 'tarif|absence|qualite|courbe|contenu';
const LEGACY_FORMS = [
  // A path segment after "/", a regex-escaped "\/" or a URL-encoded "%2F"; not "./x" (a module).
  new RegExp(`(?<!\\.)(?:\\\\?\\/|%2[Ff])(?:${SEGMENTS})(?![\\w-])`),
  // An anchor: "#" and an old id, or a bare id where it is one (lookups, id attributes, hash/id comparisons).
  new RegExp(`#(?:${IDS})\\b`),
  new RegExp(`(?:getElementById|querySelector(?:All)?|closest)\\(\\s*['"\`]#?(?:${IDS})['"\`]`),
  new RegExp(`\\bid=["'](?:${IDS})["']`),
  new RegExp(`\\b(?:hash(?:\\.slice\\(1\\))?|id)\\s*[!=]==?\\s*['"\`](?:${IDS})['"\`]`)
];
const ROOTS = ['web/src', 'web/e2e', 'web/static', 'web/scripts', 'web/vite.config.ts', 'web/svelte.config.js',
  'web/playwright.config.ts', 'backend/kelvin', 'backend/tests', 'docs', 'README.md', 'CONTRIBUTING.md',
  'DESIGN.md', 'PRODUCT.md', 'CLAUDE.md', 'web/README.md', 'backend/README.md'];
// The redirect table and its tests; the 2026-10-14 design snapshot, which documents the old paths
// it replaced; the gitignored plans.
const SKIP_FILES = ['web/src/lib/paths.ts', 'web/src/lib/paths.test.ts', 'docs/i18n-catalogue.md'];
const SKIP_DIRS = ['node_modules', '__pycache__', 'superpowers', '.svelte-kit', 'build'];

/**
 * Whether one line holds a French path or anchor (lines marked legacy-path-test excepted).
 * @param {string} line
 * @returns {boolean}
 */
export function isLegacyPathLine(line) {
  return !line.includes('legacy-path-test') && LEGACY_FORMS.some((re) => re.test(line));
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function files(path) {
  if (statSync(path, { throwIfNoEntry: false }) === undefined) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((n) => (SKIP_DIRS.includes(n) ? [] : files(join(path, n))));
}

/**
 * French paths outside lib/paths.ts, the marked block of app.html and lines marked legacy-path-test.
 * @param {string} repo
 * @returns {{ file: string; line: number; text: string }[]}
 */
export function findLegacyPaths(repo) {
  return ROOTS.flatMap((r) => files(join(repo, r)))
    .filter((f) => /\.(svelte|ts|js|mjs|html|py|md|json|webmanifest|txt|css)$/.test(f))
    .map((f) => ({ f, file: relative(repo, f).split(sep).join('/') }))
    .filter(({ file }) => !SKIP_FILES.includes(file))
    .flatMap(({ f, file }) => {
      const text = readFileSync(f, 'utf8').replace(/\/\* legacy-paths:start \*\/[\s\S]*?\/\* legacy-paths:end \*\//g, (m) =>
        m.replace(/[^\n]/g, ' ')
      );
      return text.split('\n').flatMap((l, i) =>
        isLegacyPathLine(l) ? [{ file, line: i + 1, text: l.trim() }] : []
      );
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = findLegacyPaths(fileURLToPath(new URL('../..', import.meta.url)));
  for (const x of found) console.log(`${x.file}:${x.line}: ${x.text}`);
  if (found.length) process.exit(1);
}
