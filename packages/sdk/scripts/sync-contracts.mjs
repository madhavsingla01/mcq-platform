import { readFile, writeFile } from 'node:fs/promises';

const origin = new URL('../../../services/ai-integration-service/src/application/draft-contracts.ts', import.meta.url);
const destination = new URL('../src/contracts.ts', import.meta.url);
const normalize = contents => contents.replaceAll('\r\n', '\n');
const heading = '// Generated from AI Integration Service draft contracts. Run npm run sync:contracts to update.';
const contents = heading + '\n' + normalize(await readFile(origin, 'utf8'));
if (process.argv.includes('--check')) {
  if (normalize(await readFile(destination, 'utf8')) !== contents) {
    console.error('SDK draft contracts are out of sync. Run npm --prefix packages/sdk run sync:contracts.');
    process.exitCode = 1;
  }
} else {
  await writeFile(destination, contents);
}
