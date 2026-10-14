import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from './version';

describe('VERSION', () => {
  it('is the package version, injected at build time', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});
