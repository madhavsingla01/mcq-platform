import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run dependency auditing with: npm run security:audit');

const packages = [
  '.',
  'contracts',
  'apps/desktop-web',
  'apps/mobile-web',
  'services/admin-service',
  'services/api-gateway',
  'services/attempt-service',
  'services/auth-service',
  'services/challenge-service',
  'services/media-service',
  'services/message-service',
  'services/parser-service',
  'services/quiz-service',
  'services/social-service',
];

const exceptions = [
  {
    packagePath: 'apps/desktop-web',
    dependency: 'vite',
    advisoryIds: ['1116229', '1120784', '1242622', '1242651', '1242658', '1242724', '1242730', '1243432'],
    reviewBy: '2027-01-31',
    reason: 'Vite 8 requires Node 20.19+ and a compatible plugin upgrade; schedule the toolchain migration.',
  },
  {
    packagePath: 'apps/mobile-web',
    dependency: 'vite',
    advisoryIds: ['1116229', '1120784', '1242622', '1242651', '1242658', '1242724', '1242730', '1243432'],
    reviewBy: '2027-01-31',
    reason: 'Vite 8 requires Node 20.19+ and a compatible plugin upgrade; schedule the toolchain migration.',
  },
  ...['services/attempt-service', 'services/parser-service', 'services/quiz-service'].map((packagePath) => ({
    packagePath,
    dependency: 'xlsx',
    advisoryIds: ['1108110', '1108111'],
    reviewBy: '2027-01-31',
    reason: 'The current SheetJS package has no npm fix; evaluate a maintained replacement and migration.',
  })),
];
const exceptionByFinding = new Map();
for (const exception of exceptions) {
  for (const advisoryId of exception.advisoryIds) {
    exceptionByFinding.set(
      `${exception.packagePath}|${exception.dependency}|${advisoryId}`,
      exception,
    );
  }
}

let hasBlockingFindings = false;
let hasAuditErrors = false;
const usedExceptions = new Set();
const today = new Date().toISOString().slice(0, 10);

for (const exception of exceptions) {
  if (exception.reviewBy <= today) {
    console.error(
      `${exception.packagePath}: expired dependency exception for ${exception.dependency}; review by ${exception.reviewBy}`,
    );
    hasAuditErrors = true;
  }
}

for (const packagePath of packages) {
  const packageDir = path.join(root, packagePath);
  if (!existsSync(path.join(packageDir, 'package-lock.json'))) {
    console.error(`${packagePath}: package-lock.json is missing`);
    hasAuditErrors = true;
    continue;
  }

  const result = spawnSync(process.execPath, [npmCli, 'audit', '--json', '--audit-level=high'], {
    cwd: packageDir,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    console.error(`${packagePath}: npm audit could not run: ${result.error.message}`);
    hasAuditErrors = true;
    continue;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(`${packagePath}: npm audit returned invalid JSON`);
    if (result.stderr) console.error(result.stderr.trim());
    hasAuditErrors = true;
    continue;
  }

  if (report.error || !report.metadata?.vulnerabilities) {
    console.error(`${packagePath}: npm audit failed: ${report.error?.summary || 'missing vulnerability summary'}`);
    hasAuditErrors = true;
    continue;
  }

  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    console.error(`${packagePath}: npm audit returned no vulnerability details`);
    hasAuditErrors = true;
    continue;
  }

  const counts = report.metadata.vulnerabilities;
  console.log(
    `${packagePath}: critical ${counts.critical}, high ${counts.high}, moderate ${counts.moderate}, low ${counts.low}`,
  );

  if (counts.critical || counts.high) {
    for (const [name, finding] of Object.entries(report.vulnerabilities || {})) {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        const via = finding.via || [];
        const advisories = via
          .filter((entry) => typeof entry === 'object')
          .map((entry) => ({ id: String(entry.source), title: entry.title }));
        const supportingPackages = via.filter((entry) => typeof entry === 'string');
        const matchedExceptions = advisories.map(({ id }) =>
          exceptionByFinding.get(`${packagePath}|${name}|${id}`),
        );
        const supportingPackagesAreNonBlocking = supportingPackages.every((dependency) => {
          const supportingFinding = report.vulnerabilities[dependency];
          return supportingFinding
            && supportingFinding.severity !== 'high'
            && supportingFinding.severity !== 'critical';
        });
        const isExcepted = finding.severity === 'high'
          && advisories.length > 0
          && supportingPackagesAreNonBlocking
          && matchedExceptions.every(Boolean)
          && matchedExceptions.every((exception) => exception.reviewBy > today);
        const advisoryText = advisories
          .map(({ id, title }) => `${id}: ${title}`)
          .join('; ');
        const fix = finding.fixAvailable === false
          ? 'no automatic fix'
          : `fix available: ${JSON.stringify(finding.fixAvailable)}`;
        if (isExcepted) {
          for (const exception of matchedExceptions) usedExceptions.add(exception);
          const reviewBy = matchedExceptions[0].reviewBy;
          const reason = matchedExceptions[0].reason;
          console.warn(`  accepted ${finding.severity}: ${name}; review by ${reviewBy}`);
          console.warn(`    ${reason}`);
          if (advisoryText) console.warn(`    ${advisoryText}`);
        } else {
          hasBlockingFindings = true;
          console.error(`  ${finding.severity}: ${name}${finding.isDirect ? ' (direct)' : ''}; ${fix}`);
          if (advisoryText) console.error(`    ${advisoryText}`);
        }
      }
    }
  }

  if (result.status !== 0 && result.status !== 1) {
    console.error(`${packagePath}: npm audit exited unexpectedly with status ${result.status}`);
    hasAuditErrors = true;
  } else if (result.status === 1 && counts.critical === 0 && counts.high === 0) {
    console.error(`${packagePath}: npm audit failed without a critical or high finding`);
    hasAuditErrors = true;
  }
}

for (const exception of exceptions) {
  if (!usedExceptions.has(exception)) {
    console.error(
      `${exception.packagePath}: stale dependency exception for ${exception.dependency}; remove it after the advisory is resolved`,
    );
    hasAuditErrors = true;
  }
}

if (hasAuditErrors || hasBlockingFindings) process.exitCode = 1;
