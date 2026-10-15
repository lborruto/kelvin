// Fails on any French URL path outside the legacy blocks (Plan 7, spec §4 "Paths").
// Usage: node scripts/check-paths.mjs   (from web/; scans the whole repository)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_PATH = /\/(pieces|programme|energie|maison)(?=[/?#"'`\s)]|$)|#(tarif|absence|qualite|courbe)\b/;
const ROOTS = ['web/src', 'web/e2e', 'backend/kelvin', 'README.md', 'CONTRIBUTING.md', 'DESIGN.md', 'PRODUCT.md',
  'CLAUDE.md', 'web/README.md', 'backend/README.md'];
const SKIP_FILES = ['web/src/lib/paths.ts', 'web/src/lib/paths.test.ts'];

/**
 * @param {string} path
 * @returns {string[]}
 */
function files(path) {
  if (statSync(path, { throwIfNoEntry: false }) === undefined) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((n) => (n === 'node_modules' || n === '__pycache__' ? [] : files(join(path, n))));
}

/**
 * French paths outside lib/paths.ts, the marked block of app.html and lines marked legacy-path-test.
 * @param {string} repo
 * @returns {{ file: string; line: number; text: string }[]}
 */
export function findLegacyPaths(repo) {
  return ROOTS.flatMap((r) => files(join(repo, r)))
    .filter((f) => /\.(svelte|ts|js|mjs|html|py|md)$/.test(f))
    .map((f) => ({ f, file: relative(repo, f).split(sep).join('/') }))
    .filter(({ file }) => !SKIP_FILES.includes(file))
    .flatMap(({ f, file }) => {
      const text = readFileSync(f, 'utf8').replace(/\/\* legacy-paths:start \*\/[\s\S]*?\/\* legacy-paths:end \*\//g, (m) =>
        m.replace(/[^\n]/g, ' ')
      );
      return text.split('\n').flatMap((l, i) =>
        LEGACY_PATH.test(l) && !l.includes('legacy-path-test') ? [{ file, line: i + 1, text: l.trim() }] : []
      );
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = findLegacyPaths(fileURLToPath(new URL('../..', import.meta.url)));
  for (const x of found) console.log(`${x.file}:${x.line}: ${x.text}`);
  if (found.length) process.exit(1);
}
