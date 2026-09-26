/**
 * Vérifie que la liste ASSETS du service worker correspond aux fichiers du dépôt.
 * Usage : node tools/check-sw.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean));

const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = `${dir}/${f}`;
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});
const needed = [...walk('js'), ...walk('css'), ...walk('assets').filter((f) => /\.(woff2|png)$/.test(f))];

let ok = true;
for (const f of needed) if (!listed.has(f)) { console.log('Manquant dans sw.js :', f); ok = false; }
for (const f of listed) if (!existsSync(join(root, f))) { console.log('Listé mais introuvable :', f); ok = false; }
console.log(ok ? 'sw.js : liste ASSETS complète.' : 'sw.js : liste à corriger.');
process.exit(ok ? 0 : 1);
