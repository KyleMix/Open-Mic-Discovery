import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No raw database or network string may reach a screen.
 *
 * The translation layer (userError) exists, but three feature modules were
 * written after the original sweep and shipped `throw new Error(error.message)`
 * again, so a Postgres constraint string could be the first thing a new user
 * read. This walks the source tree and fails on the pattern itself, the same
 * way app-routes.test.ts guards the route tree.
 */

const ROOTS = ['src/app', 'src/features', 'src/components', 'src/lib', 'src/stores'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) {
      return [];
    }
    return [path];
  });
}

it('throws no raw .message strings at the user', () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      const match = source.match(/throw new Error\(\s*\w+\.message\s*\)/);
      if (match) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
