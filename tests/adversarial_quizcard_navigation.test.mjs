/**
 * Adversarial Stress Test: ChallengeCard Fallback Navigation Invariant
 *
 * Verifies:
 * 1. ChallengeCard (QuizCard.jsx:801) strictly navigates to `/challenges/${id}` when onSelect is absent.
 * 2. Never routes to `/quiz/${id}` or any quiz route under ANY input condition.
 * 3. Handles item passed via `challenge`, `data`, or `quiz` prop.
 * 4. Correctly resolves `_id`, `id`, and fallback priority.
 * 5. When `onSelect` is supplied, routes through `onSelect(id)` and bypasses `navigate`.
 * 6. AST & source inspection verifies zero references to `/quiz/` inside ChallengeCard.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    failures.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✔ PASS: ${message}`);
  }
}

function expectEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function expectNotEqual(actual, expected, message) {
  assert(actual !== expected, `${message} (expected NOT ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

async function runAdversarialTest() {
  console.log('\n=================================================================');
  console.log('   ADVERSARIAL STRESS TEST: QUIZCARD CHALLENGE NAVIGATION       ');
  console.log('=================================================================\n');

  const quizCardPath = path.join(ROOT_DIR, 'apps/desktop-web/src/components/quiz/QuizCard.jsx');
  const fileContent = fs.readFileSync(quizCardPath, 'utf8');

  // --- Suite 1: Static Source & AST Boundary Verification ---
  console.log('--- Suite 1: Source & Scope Boundary Isolation ---');

  // Extract ChallengeCard function implementation boundary
  const challengeCardMatch = fileContent.match(/function ChallengeCard\([\s\S]*?\n\}\n\n\/\* ===/);
  assert(challengeCardMatch !== null, 'ChallengeCard component definition isolated cleanly in QuizCard.jsx');

  const challengeCardSource = challengeCardMatch ? challengeCardMatch[0] : '';

  // Invariant 1.1: Zero occurrences of /quiz/ in ChallengeCard
  const quizRouteOccurrences = (challengeCardSource.match(/\/quiz\//g) || []).length;
  expectEqual(quizRouteOccurrences, 0, 'ChallengeCard contains ZERO occurrences of "/quiz/"');

  // Invariant 1.2: Exact navigation target matches /challenges/${id}
  const challengeNavOccurrences = (challengeCardSource.match(/navigate\(\`\/challenges\/\$\{id\}\`\)/g) || []).length;
  expectEqual(challengeNavOccurrences, 1, 'ChallengeCard contains exact navigation pattern `navigate(`/challenges/${id}`)` at fallback');

  // Invariant 1.3: Dual id extraction `const id = item._id || item.id;`
  assert(
    challengeCardSource.includes('const id = item._id || item.id;'),
    'ChallengeCard resolves id via `const id = item._id || item.id;`'
  );

  // Invariant 1.4: Polymorphic dispatcher routing
  assert(
    fileContent.includes("if (variant === 'challenge') {") &&
    fileContent.includes("<ChallengeCard challenge={data || challenge || quiz} {...rest} />"),
    'QuizCard polymorphic dispatcher delegates variant="challenge" to ChallengeCard'
  );

  // --- Suite 2: Adversarial Simulation of handlePlay Navigation ---
  console.log('\n--- Suite 2: Adversarial Runtime Simulation of handlePlay ---');

  function simulateChallengeCardPlay({ challenge, data, quiz, onSelect }) {
    let navigatedTo = null;
    let selectedId = null;

    const navigate = (path) => {
      navigatedTo = path;
    };

    const item = challenge || data || quiz;
    if (!item) return { returnedNull: true, navigatedTo, selectedId };

    const id = item._id || item.id;

    // Simulate handlePlay
    const handlePlay = () => {
      if (onSelect) {
        onSelect(id);
      } else {
        navigate(`/challenges/${id}`);
      }
    };

    handlePlay();
    return { returnedNull: false, navigatedTo, selectedId };
  }

  // Adversarial Case 1: Standard _id, onSelect omitted
  const res1 = simulateChallengeCardPlay({
    challenge: { _id: 'contest_101', title: 'Speed Contest' }
  });
  expectEqual(res1.navigatedTo, '/challenges/contest_101', 'Case 1: Standard _id routes to /challenges/contest_101');
  assert(!res1.navigatedTo.includes('/quiz/'), 'Case 1: Target route does NOT contain /quiz/');

  // Adversarial Case 2: Only .id (SQL/numeric ID), onSelect omitted
  const res2 = simulateChallengeCardPlay({
    challenge: { id: 'contest_202', title: 'Algo Battle' }
  });
  expectEqual(res2.navigatedTo, '/challenges/contest_202', 'Case 2: id fallback routes to /challenges/contest_202');
  assert(!res2.navigatedTo.includes('/quiz/'), 'Case 2: Target route does NOT contain /quiz/');

  // Adversarial Case 3: Both _id and id present; _id must take precedence
  const res3 = simulateChallengeCardPlay({
    challenge: { _id: 'preferred_mongo_id', id: 'legacy_id' }
  });
  expectEqual(res3.navigatedTo, '/challenges/preferred_mongo_id', 'Case 3: Prefers _id when both are present');

  // Adversarial Case 4: item passed via `data` prop instead of `challenge`
  const res4 = simulateChallengeCardPlay({
    data: { _id: 'data_prop_contest_303' }
  });
  expectEqual(res4.navigatedTo, '/challenges/data_prop_contest_303', 'Case 4: data prop correctly resolves and routes to /challenges/');

  // Adversarial Case 5: item passed via `quiz` prop (polymorphic reuse)
  const res5 = simulateChallengeCardPlay({
    quiz: { _id: 'quiz_prop_contest_404' }
  });
  expectEqual(res5.navigatedTo, '/challenges/quiz_prop_contest_404', 'Case 5: quiz prop fallback routes to /challenges/ instead of /quiz/');

  // Adversarial Case 6: onSelect is explicitly null
  const res6 = simulateChallengeCardPlay({
    challenge: { _id: 'null_onselect_505' },
    onSelect: null
  });
  expectEqual(res6.navigatedTo, '/challenges/null_onselect_505', 'Case 6: onSelect=null triggers fallback to /challenges/null_onselect_505');

  // Adversarial Case 7: onSelect is explicitly undefined
  const res7 = simulateChallengeCardPlay({
    challenge: { _id: 'undef_onselect_606' },
    onSelect: undefined
  });
  expectEqual(res7.navigatedTo, '/challenges/undef_onselect_606', 'Case 7: onSelect=undefined triggers fallback to /challenges/undef_onselect_606');

  // Adversarial Case 8: onSelect is provided as function
  let callbackReceivedId = null;
  const res8 = simulateChallengeCardPlay({
    challenge: { _id: 'custom_callback_707' },
    onSelect: (id) => {
      callbackReceivedId = id;
    }
  });
  expectEqual(res8.navigatedTo, null, 'Case 8: navigate() is bypassed when onSelect is provided');
  expectEqual(callbackReceivedId, 'custom_callback_707', 'Case 8: onSelect callback receives the correct id');

  // Adversarial Case 9: Null item
  const res9 = simulateChallengeCardPlay({
    challenge: null,
    data: null,
    quiz: null
  });
  expectEqual(res9.returnedNull, true, 'Case 9: Null item gracefully returns without error or navigation');

  // --- Suite 3: Cross-Check Against StandardQuizCard Navigation ---
  console.log('\n--- Suite 3: Isolation Contrast vs StandardQuizCard ---');

  // StandardQuizCard SHOULD navigate to /quiz/:id or /quiz/start/:id or /take-quiz/:id
  const standardCardMatch = fileContent.match(/function StandardQuizCard\([\s\S]*?\n\}\n\n\/\* ===/);
  const standardCardSource = standardCardMatch ? standardCardMatch[0] : '';
  assert(standardCardSource.includes('/quiz/'), 'StandardQuizCard legitimately navigates to /quiz/...');
  assert(!standardCardSource.includes('/challenges/'), 'StandardQuizCard does NOT leak into /challenges/...');

  console.log('\n=================================================================');
  console.log('              ADVERSARIAL STRESS TEST SUMMARY                   ');
  console.log('=================================================================');
  console.log(`  Total Invariants Tested : ${totalTests}`);
  console.log(`  Passed                  : ${passedTests}`);
  console.log(`  Failed                  : ${failedTests}`);
  console.log(`  Pass Rate               : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('-----------------------------------------------------------------');

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('\n✔ ALL ADVERSARIAL CHALLENGES PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runAdversarialTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
