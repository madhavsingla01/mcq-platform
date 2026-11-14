import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rawPaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8',
});
const files = [...new Set(rawPaths.split('\0'))].filter(file =>
  /\.(?:[cm]?js|jsx|tsx?)$/.test(file) && existsSync(path.join(root, file)),
).sort();

const groups = new Map();
for (const file of files) {
  const packageName = file.match(/^(?:apps|services)\/[^/]+/)?.[0] ??
    (file.startsWith('contracts/') ? 'contracts' : 'root');
  const group = groups.get(packageName) ?? { typescript: [], javascript: [] };
  if (/\.tsx?$/.test(file)) group.typescript.push(file);
  else group.javascript.push(file);
  groups.set(packageName, group);
}

const inventory = Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)));
if (process.argv.includes('--json')) console.log(JSON.stringify(inventory, null, 2));
else {
  console.table(Object.fromEntries(Object.entries(inventory).map(([name, group]) =>
    [name, { TypeScript: group.typescript.length, JavaScript: group.javascript.length }],
  )));
  const count = language => Object.values(inventory).reduce((total, group) => total + group[language].length, 0);
  console.log(`${count('typescript')} TypeScript files and ${count('javascript')} JavaScript files (source, tests, and tooling).`);
  console.log('Run npm run types:inventory -- --json for each file path.');
}
