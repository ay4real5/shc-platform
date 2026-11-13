// Design guard (S-018). SHC has its own look (navy and gold) and must never drift back to Primordial's:
// - website colours come from the brand-/accent- tokens in src/app/globals.css, never violet/indigo/fuchsia/purple/pink;
// - Primordial's teal and coral colours, fonts (Inter, Plus Jakarta Sans) and mesh backgrounds may not appear in the
//   website or the phone app.
// Runs with `npm run lint -w @alora/web`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OTHER_FAMILIES = /\b(violet|indigo|fuchsia|purple|pink)-(50|[1-9]00|950)\b/g;
const PRIMORDIAL = [
  // Primordial teal
  '#effcf9', '#ccf7ee', '#9aeedd', '#5fdcc8', '#2fc2ae', '#14a896', '#0d877a', '#0f766e', '#115e59', '#134e4a', '#042f2e', '#f6faf9',
  // Primordial coral
  '#fff4f2', '#ffe5e0', '#ffcbc2', '#fea697', '#f97362', '#ef5a46', '#e0533f', '#b93a28', '#993326', '#7f3025',
];
const OLD_LOOK = new RegExp(`(${PRIMORDIAL.join('|')})\\b|Plus_Jakarta|Plus Jakarta|\\bInter\\(|bg-mesh|expo-linear-gradient`, 'gi');

const problems = [];
function walk(dir, checkFamilies) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules') continue;
    if (statSync(path).isDirectory()) walk(path, checkFamilies);
    else if (/\.(tsx?|css|json)$/.test(name)) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (checkFamilies) for (const m of line.matchAll(OTHER_FAMILIES)) problems.push(`${path}:${i + 1}  ${m[0]}  → use brand-/accent- tokens`);
          for (const m of line.matchAll(OLD_LOOK)) problems.push(`${path}:${i + 1}  ${m[0]}  → Primordial's look; SHC uses navy/gold (S-018)`);
        });
    }
  }
}
walk('src', true);
walk('../mobile/src', false);
for (const file of ['../mobile/app.json', 'public/logo.svg', 'src/app/icon.svg', '../api/src/modules/notifications/delivery/email-html.ts']) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(OLD_LOOK)) problems.push(`${file}:${i + 1}  ${m[0]}  → Primordial's look (S-018)`);
    });
}
if (problems.length) {
  console.error(`Design guard failed (S-018):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Design guard OK: SHC navy/gold only');
