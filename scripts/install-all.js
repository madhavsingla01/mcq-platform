/**
 * Helper script to install node_modules across the web apps and services.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const packages = [
  'apps/desktop-web',
  'apps/mobile-web',
  'services/api-gateway',
  'services/auth-service',
  'services/quiz-service',
  'services/parser-service',
  'services/attempt-service',
  'services/social-service',
  'services/message-service',
  'services/media-service',
  'services/admin-service',
];

console.log('📦 Installing dependencies across all web apps and microservices...\n');

for (const pkg of packages) {
  const dir = path.join(root, pkg);
  if (fs.existsSync(path.join(dir, 'node_modules'))) {
    console.log(`⏩  Skipping (already installed): ${pkg}`);
    continue;
  }
  console.log(`➡️  Installing: ${pkg}`);
  try {
    execSync('npm install --prefer-offline', { cwd: dir, stdio: 'inherit' });
    console.log(`✅  Finished: ${pkg}\n`);
  } catch (err) {
    console.error(`❌  Failed installing: ${pkg}`);
    process.exit(1);
  }
}

console.log('🎉 All web app and microservice dependencies installed successfully!');
