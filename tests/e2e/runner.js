#!/usr/bin/env node

/**
 * QuizFocus E2E Test Suite Runner
 * Executes Tier 1 through Tier 5 end-to-end tests across features F1 through F15 and adversarial hardening.
 * Usage:
 *   node tests/e2e/runner.js
 *   node tests/e2e/runner.js --tier=1
 *   node tests/e2e/runner.js --tier=5
 *   node tests/e2e/runner.js --grep="F1"
 *   node tests/e2e/runner.js --verbose
 */

import { globalTestContext, runSuite } from './helpers/runner-core.js';

// Parse command line arguments
const args = process.argv.slice(2);
let tierFilter = null;
let grepFilter = null;
let verbose = false;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    tierFilter = arg.split('=')[1].trim();
  } else if (arg.startsWith('--grep=')) {
    grepFilter = arg.split('=')[1].trim();
  } else if (arg === '--verbose' || arg === '-v') {
    verbose = true;
  }
}

console.log('\x1b[1m\x1b[35m=================================================================\x1b[0m');
console.log('\x1b[1m\x1b[35m             QuizFocus MCQ Platform — E2E Test Runner            \x1b[0m');
console.log('\x1b[1m\x1b[35m=================================================================\x1b[0m');
console.log(`\x1b[90mConfiguration: Tier Filter: ${tierFilter || 'ALL (1-5)'} | Grep: ${grepFilter || 'NONE'} | Verbose: ${verbose}\x1b[0m\n`);

async function main() {
  const startTime = performance.now();

  // Load requested test suites into globalTestContext
  if (!tierFilter || tierFilter === '1') {
    await import('./tier1-feature-coverage.test.js');
  }
  if (!tierFilter || tierFilter === '2') {
    await import('./tier2-boundary-corner.test.js');
  }
  if (!tierFilter || tierFilter === '3') {
    await import('./tier3-cross-feature.test.js');
  }
  if (!tierFilter || tierFilter === '4') {
    await import('./tier4-application-scenarios.test.js');
  }
  if (!tierFilter || tierFilter === '5') {
    await import('./tier5-adversarial-hardening.test.js');
  }

  const overallResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };

  for (const suite of globalTestContext.suites) {
    console.log(`\x1b[1m\x1b[34m▶ Running Suite: ${suite.name}\x1b[0m`);
    const suiteRes = await runSuite(suite, { grep: grepFilter, verbose });
    overallResults.total += suiteRes.total;
    overallResults.passed += suiteRes.passed;
    overallResults.failed += suiteRes.failed;
    overallResults.skipped += suiteRes.skipped;
    overallResults.failures.push(...suiteRes.failures);
    console.log('');
  }

  const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
  const passRate = overallResults.total > 0
    ? ((overallResults.passed / overallResults.total) * 100).toFixed(1)
    : '100.0';

  console.log('\x1b[1m\x1b[35m=================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m                       E2E EXECUTION SUMMARY                     \x1b[0m');
  console.log('\x1b[1m\x1b[35m=================================================================\x1b[0m');
  console.log(`  Total Tests Executed : \x1b[1m${overallResults.total}\x1b[0m`);
  console.log(`  Passed               : \x1b[32m\x1b[1m${overallResults.passed}\x1b[0m`);
  console.log(`  Failed               : ${overallResults.failed > 0 ? `\x1b[31m\x1b[1m${overallResults.failed}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log(`  Skipped              : \x1b[90m${overallResults.skipped}\x1b[0m`);
  console.log(`  Pass Rate            : \x1b[1m${passRate}%\x1b[0m`);
  console.log(`  Execution Time       : ${durationSec}s`);
  console.log('\x1b[1m\x1b[35m-----------------------------------------------------------------\x1b[0m');

  if (overallResults.failures.length > 0) {
    console.log('\n\x1b[1m\x1b[31mFAILURES BREAKDOWN:\x1b[0m');
    overallResults.failures.forEach((f, idx) => {
      console.log(`\x1b[31m${idx + 1}) [${f.suite}] ${f.test}\x1b[0m`);
      console.log(`   \x1b[90m${f.error}\x1b[0m`);
    });
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('\n\x1b[32m\x1b[1m✔ ALL E2E TESTS PASSED CLEANLY!\x1b[0m\n');
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('\x1b[31m[Fatal Runner Error]:\x1b[0m', err);
  process.exit(1);
});
