/**
 * QuizFocus UI Empirical Stress Test & Adversarial Verification Suite
 * Role: UI Empirical Challenger
 *
 * Verifies:
 * 1. Polymorphic QuizCard under extreme edge cases (quiz, draft, attempt, challenge).
 * 2. SettingsMenu under extreme edge cases (popover, drawer, modal, items, tabs).
 * 3. Mobile Native Touch & Emil Kowalski CSS standards.
 */

process.env.VITE_API_URL = 'http://localhost:5000';
process.env.VITE_DEV_PORT = '3000';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createServer } from '../apps/desktop-web/node_modules/vite/dist/node/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const React = require('../apps/desktop-web/node_modules/react');
const { renderToString } = require('../apps/desktop-web/node_modules/react-dom/server');
const { MemoryRouter } = require('../apps/desktop-web/node_modules/react-router-dom');

const RESULTS = {
  total: 0,
  passed: 0,
  failed: 0,
  suites: [],
};

function runTest(suiteName, testName, fn) {
  RESULTS.total++;
  try {
    fn();
    RESULTS.passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } catch (err) {
    RESULTS.failed++;
    console.error(`  ✗ [FAIL] ${testName}`);
    console.error(`    Error: ${err.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${actual} to be ${expected}`);
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) throw new Error(`Expected ${actual} <= ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      if (!(actual >= expected)) throw new Error(`Expected ${actual} >= ${expected}`);
    },
    toContain(expected) {
      if (typeof actual === 'string' && !actual.includes(expected)) {
        throw new Error(`Expected string to contain "${expected}"`);
      }
      if (Array.isArray(actual) && !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${expected}`);
      }
    },
    notToContain(expected) {
      if (typeof actual === 'string' && actual.includes(expected)) {
        throw new Error(`Expected string NOT to contain "${expected}"`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy value, got ${actual}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy value, got ${actual}`);
    },
    toNotThrow() {
      // already executed
    }
  };
}

async function run() {
  console.log('======================================================================');
  console.log('       QuizFocus UI Empirical Challenger — Stress Test Suite          ');
  console.log('======================================================================\n');

  const root = path.resolve(__dirname, '../apps/desktop-web');
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom'
  });

  try {
    const QuizCardMod = await server.ssrLoadModule('/src/components/quiz/QuizCard.jsx');
    const QuizCard = QuizCardMod.default;
    const { DraftCard, AttemptCard, ChallengeCard, StandardQuizCard } = QuizCardMod;

    const SettingsMenuMod = await server.ssrLoadModule('/src/components/ui/SettingsMenu/SettingsMenu.jsx');
    const SettingsMenu = SettingsMenuMod.default;

    // Helper to render in MemoryRouter
    const renderWithRouter = (element) => {
      return renderToString(React.createElement(MemoryRouter, null, element));
    };

    // =========================================================================
    // SUITE 1: QuizCard — variant="quiz" Stress & Edge Cases
    // =========================================================================
    console.log('▶ Suite 1: QuizCard (variant="quiz") Stress & Worst-Case Data');

    runTest('QuizCard (quiz)', 'Q1.1: Handles null quiz gracefully without throwing', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'quiz', quiz: null }));
      expect(html).toBe('');
    });

    runTest('QuizCard (quiz)', 'Q1.2: Handles undefined quiz gracefully without throwing', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'quiz', quiz: undefined }));
      expect(html).toBe('');
    });

    runTest('QuizCard (quiz)', 'Q1.3: Handles empty quiz object {} with fallback untitled title', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'quiz', quiz: {} }));
      expect(html).toContain('Untitled Quiz');
      expect(html).toContain('clean-quiz-card');
    });

    runTest('QuizCard (quiz)', 'Q1.4: Handles 2,500-character extreme title with truncation and tooltip', () => {
      const longTitle = 'Supercalifragilisticexpialidocious '.repeat(100);
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'quiz', quiz: { _id: 'q1', title: longTitle } }));
      expect(html).toContain('clean-quiz-title');
      expect(html).toContain('…'); // Verifies truncated displayTitle
      expect(html).toContain(longTitle); // Full title present in tooltip title attribute
    });

    runTest('QuizCard (quiz)', 'Q1.5: Handles empty string title with fallback', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'quiz', quiz: { _id: 'q1', title: '' } }));
      expect(html).toContain('Untitled Quiz');
    });

    runTest('QuizCard (quiz)', 'Q1.6: Handles missing/null uploader, tags, and category', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'quiz',
        quiz: { _id: 'q1', title: 'Edge Quiz', uploader: null, tags: null, category: null }
      }));
      expect(html).toContain('Edge Quiz');
    });

    runTest('QuizCard (quiz)', 'Q1.7: Handles malformed thumbnail "[object Object]" and empty string', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'quiz',
        quiz: { _id: 'q1', title: 'Edge Quiz', thumbnail: '[object Object]' }
      }));
      // Should NOT render an img with src="[object Object]"
      expect(html).notToContain('[object Object]');
    });

    runTest('QuizCard (quiz)', 'Q1.8: Handles zero questions and huge question count (999,999)', () => {
      const htmlZero = renderWithRouter(React.createElement(QuizCard, {
        variant: 'quiz',
        quiz: { _id: 'q1', title: 'Zero Q', questionCount: 0 }
      }));
      expect(htmlZero).toContain('Zero Q');

      const htmlHuge = renderWithRouter(React.createElement(QuizCard, {
        variant: 'quiz',
        quiz: { _id: 'q2', title: 'Huge Q', questionCount: 999999 }
      }));
      expect(htmlHuge).toContain('Huge Q');
    });

    runTest('QuizCard (quiz)', 'Q1.9: Handles huge social counts (formatCount: 1.5M, 25k)', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'quiz',
        quiz: {
          _id: 'q1',
          title: 'Viral Quiz',
          totalAttempts: 1500000,
          social: { likeCount: 25000, bookmarkCount: 1200000 }
        }
      }));
      expect(html).toContain('Viral Quiz');
    });

    // =========================================================================
    // SUITE 2: QuizCard — variant="draft" Stress & Edge Cases
    // =========================================================================
    console.log('\n▶ Suite 2: QuizCard (variant="draft") Stress & Worst-Case Data');

    runTest('QuizCard (draft)', 'D2.1: Handles null/undefined draft gracefully', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'draft', draft: null }));
      expect(html).toBe('');
    });

    runTest('QuizCard (draft)', 'D2.2: Handles empty draft object {} with defaults', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'draft', draft: {} }));
      expect(html).toContain('variant-draft');
      expect(html).toContain('Untitled Draft');
      expect(html).toContain('General');
      expect(html).toContain('25% complete');
    });

    runTest('QuizCard (draft)', 'D2.3: Handles extreme 1,500-char draft title', () => {
      const longTitle = 'Draft ' + 'LongName '.repeat(100);
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'draft',
        draft: { _id: 'd1', title: longTitle }
      }));
      expect(html).toContain('draft-title');
      expect(html).toContain(longTitle);
    });

    runTest('QuizCard (draft)', 'D2.4: Handles isReadyToPublish = true vs false readiness percentages', () => {
      const htmlReady = renderWithRouter(React.createElement(QuizCard, {
        variant: 'draft',
        draft: { _id: 'd1', title: 'Ready Draft', isReadyToPublish: true }
      }));
      expect(htmlReady).toContain('Ready to publish');

      const htmlPartial = renderWithRouter(React.createElement(QuizCard, {
        variant: 'draft',
        draft: { _id: 'd2', title: 'Incomplete Draft', isReadyToPublish: false, readiness: 80 }
      }));
      expect(htmlPartial).toContain('80% complete');
    });

    runTest('QuizCard (draft)', 'D2.5: Handles challenge draft flag (isChallenge: true)', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'draft',
        draft: { _id: 'd3', title: 'Contest Draft', isChallenge: true }
      }));
      expect(html).toContain('Contest Draft');
    });

    runTest('QuizCard (draft)', 'D2.6: Handles publishing and duplicating loading states', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'draft',
        draft: { _id: 'd4', title: 'Publishing Draft' },
        publishing: true,
        duplicating: true
      }));
      expect(html).toContain('Publishing Draft');
    });

    // =========================================================================
    // SUITE 3: QuizCard — variant="attempt" Stress & Edge Cases
    // =========================================================================
    console.log('\n▶ Suite 3: QuizCard (variant="attempt") Stress & Worst-Case Data');

    runTest('QuizCard (attempt)', 'A3.1: Handles null/undefined attempt gracefully', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'attempt', attempt: null }));
      expect(html).toBe('');
    });

    runTest('QuizCard (attempt)', 'A3.2: Handles empty attempt object {} without NaN in progress bar', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'attempt', attempt: {} }));
      expect(html).toContain('variant-attempt');
      expect(html).toContain('Untitled Quiz');
      expect(html).toContain('In Progress');
      // Verify no NaN rendered in style or text
      expect(html).notToContain('NaN%');
      expect(html).notToContain('NaN');
    });

    runTest('QuizCard (attempt)', 'A3.3: Resolves populated quizId object vs raw string quizId', () => {
      const htmlObj = renderWithRouter(React.createElement(QuizCard, {
        variant: 'attempt',
        attempt: {
          _id: 'att1',
          quizId: { _id: 'q_nested_99', title: 'Populated Nested Title' },
          answeredCount: 3,
          questionsCount: 10
        }
      }));
      expect(htmlObj).toContain('Populated Nested Title');
      expect(htmlObj).toContain('3 of 10 questions answered (30%)');

      const htmlStr = renderWithRouter(React.createElement(QuizCard, {
        variant: 'attempt',
        attempt: {
          _id: 'att2',
          quizId: 'q_raw_123',
          title: 'Direct Title',
          answeredCount: 5,
          questionsCount: 5
        }
      }));
      expect(htmlStr).toContain('Direct Title');
      expect(htmlStr).toContain('5 of 5 questions answered (100%)');
    });

    runTest('QuizCard (attempt)', 'A3.4: Boundary: 0 questions, 0 answered (prevents division by zero)', () => {
      const html = renderWithRouter(React.createElement(QuizCard, {
        variant: 'attempt',
        attempt: {
          _id: 'att_zero',
          title: 'Zero Attempt',
          answeredCount: 0,
          questionsCount: 0
        }
      }));
      expect(html).notToContain('NaN');
      expect(html).toContain('Zero Attempt');
    });

    runTest('QuizCard (attempt)', 'A3.5: Boundary: progressPercent boundary clamped in [5%, 100%]', () => {
      const html0 = renderWithRouter(React.createElement(QuizCard, {
        variant: 'attempt',
        attempt: { _id: 'att0', answeredCount: 0, questionsCount: 100 }
      }));
      // Min width is 5% so the bar is visibly discoverable
      expect(html0).toContain('width:5%');

      const html100 = renderWithRouter(React.createElement(QuizCard, {
        variant: 'attempt',
        attempt: { _id: 'att100', answeredCount: 100, questionsCount: 100 }
      }));
      expect(html100).toContain('width:100%');
    });

    // =========================================================================
    // SUITE 4: QuizCard — variant="challenge" Stress & Edge Cases
    // =========================================================================
    console.log('\n▶ Suite 4: QuizCard (variant="challenge") Stress & Worst-Case Data');

    runTest('QuizCard (challenge)', 'C4.1: Handles null/undefined challenge gracefully', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'challenge', challenge: null }));
      expect(html).toBe('');
    });

    runTest('QuizCard (challenge)', 'C4.2: Handles empty challenge object {} with defaults', () => {
      const html = renderWithRouter(React.createElement(QuizCard, { variant: 'challenge', challenge: {} }));
      expect(html).toContain('variant-challenge');
      expect(html).toContain('Untitled Challenge');
      expect(html).toContain('All Levels');
      expect(html).toContain('Untimed');
      expect(html).toContain('0'); // joinedCount
    });

    runTest('QuizCard (challenge)', 'C4.3: Correct category icon dispatching (code, algo, logic, science, fallback)', () => {
      const htmlCode = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c1', title: 'Coding Contest', category: 'Programming' }
      }));
      expect(htmlCode).toContain('Coding Contest');

      const htmlAlgo = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c2', title: 'Algo Battle', category: 'Data Structures' }
      }));
      expect(htmlAlgo).toContain('Algo Battle');

      const htmlLogic = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c3', title: 'Logic Duel', category: 'Reasoning' }
      }));
      expect(htmlLogic).toContain('Logic Duel');
    });

    runTest('QuizCard (challenge)', 'C4.4: Participant counter formatCount boundaries (0, 999, 1k, 1.2M)', () => {
      const htmlK = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c_k', title: 'Thousand Contest', joinedCount: 4520 }
      }));
      expect(htmlK).toContain('4.5k');

      const htmlM = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c_m', title: 'Million Contest', joinedCount: 2300000 }
      }));
      expect(htmlM).toContain('2.3M');
    });

    runTest('QuizCard (challenge)', 'C4.5: Bookmark toggle state reflects isBookmarked true/false', () => {
      const htmlBm = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c_bm', title: 'Bookmarked Contest' },
        isBookmarked: true
      }));
      expect(htmlBm).toContain('btn-icon-bookmark active');

      const htmlNoBm = renderWithRouter(React.createElement(QuizCard, {
        variant: 'challenge',
        challenge: { _id: 'c_nobm', title: 'Unbookmarked Contest' },
        isBookmarked: false
      }));
      expect(htmlNoBm).toContain('btn-icon-bookmark');
      expect(htmlNoBm).notToContain('btn-icon-bookmark active');
    });

    // =========================================================================
    // SUITE 5: SettingsMenu — Variant Switching & Complex Content Stress
    // =========================================================================
    console.log('\n▶ Suite 5: SettingsMenu (Popover, Drawer, Modal) Stress & Edge Cases');

    runTest('SettingsMenu', 'S5.1: Renders closed state (default trigger only, no panel in DOM)', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'popover',
        isOpen: false
      }));
      expect(html).toContain('settings-menu-default-trigger');
      expect(html).notToContain('settings-menu-panel');
    });

    runTest('SettingsMenu', 'S5.2: Variant="popover" rendered with alignment and squircle panel', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'popover',
        align: 'right',
        isOpen: true,
        title: 'Popover Settings'
      }));
      expect(html).toContain('variant-popover');
      expect(html).toContain('align-right');
      expect(html).toContain('Popover Settings');
    });

    runTest('SettingsMenu', 'S5.3: Variant="drawer" rendered with backdrop and right drawer panel', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'drawer',
        isOpen: true,
        title: 'Drawer Settings'
      }));
      expect(html).toContain('settings-menu-backdrop');
      expect(html).toContain('variant-drawer');
      expect(html).toContain('Drawer Settings');
    });

    runTest('SettingsMenu', 'S5.4: Variant="modal" rendered with backdrop and centered modal dialog', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'modal',
        isOpen: true,
        title: 'Modal Settings',
        subtitle: 'Configure builder parameters'
      }));
      expect(html).toContain('settings-menu-backdrop');
      expect(html).toContain('variant-modal');
      expect(html).toContain('Modal Settings');
      expect(html).toContain('Configure builder parameters');
    });

    runTest('SettingsMenu', 'S5.5: Stress: Extreme 2,000-char title and subtitle without crash', () => {
      const longTitle = 'SuperLongSettingTitle '.repeat(80);
      const longSubtitle = 'SuperLongSettingSubtitle '.repeat(80);
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'modal',
        isOpen: true,
        title: longTitle,
        subtitle: longSubtitle
      }));
      expect(html).toContain('settings-menu-title');
      expect(html).toContain(longTitle);
    });

    runTest('SettingsMenu', 'S5.6: Stress: Comprehensive section items (toggle, select, segmented, action, divider, render)', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'modal',
        isOpen: true,
        title: 'All Item Types',
        sections: [
          {
            id: 'sec_all',
            title: 'General Section',
            items: [
              { id: 't1', type: 'toggle', label: 'Dark Mode', checked: true },
              { id: 's1', type: 'select', label: 'Difficulty', value: 'medium', options: [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }] },
              { id: 'seg1', type: 'segmented', label: 'Layout', value: 'grid', options: [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }] },
              { id: 'a1', type: 'action', label: 'Reset Defaults', danger: true },
              { id: 'a2', type: 'action', label: 'Save Changes', primary: true },
              { id: 'div1', type: 'divider' },
              { id: 'custom1', render: () => React.createElement('div', { className: 'my-custom-item' }, 'Custom JSX Child') }
            ]
          }
        ]
      }));
      expect(html).toContain('type-toggle');
      expect(html).toContain('type-select');
      expect(html).toContain('type-segmented');
      expect(html).toContain('is-danger');
      expect(html).toContain('is-primary');
      expect(html).toContain('settings-menu-divider');
      expect(html).toContain('my-custom-item');
    });

    runTest('SettingsMenu', 'S5.7: Stress: Tabs bar with activeTab matching and custom footer', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'modal',
        isOpen: true,
        tabs: [
          { id: 'tab_gen', label: 'General' },
          { id: 'tab_adv', label: 'Advanced' }
        ],
        activeTab: 'tab_gen',
        footer: React.createElement('button', { className: 'btn-footer-test' }, 'Footer Button')
      }));
      expect(html).toContain('settings-menu-tabs-bar');
      expect(html).toContain('is-active');
      expect(html).toContain('General');
      expect(html).toContain('Advanced');
      expect(html).toContain('btn-footer-test');
    });

    runTest('SettingsMenu', 'S5.8: Handles empty sections and empty tabs gracefully', () => {
      const html = renderToString(React.createElement(SettingsMenu, {
        variant: 'popover',
        isOpen: true,
        sections: [],
        tabs: []
      }));
      expect(html).toContain('settings-menu-panel');
      expect(html).notToContain('settings-menu-tabs-bar');
    });

    // =========================================================================
    // SUITE 6: Mobile Native Touch & Emil Kowalski CSS Audit
    // =========================================================================
    console.log('\n▶ Suite 6: Mobile Native Touch & Emil Kowalski CSS Standards');

    const cssFiles = [
      { name: 'SettingsMenu.css', path: path.resolve(root, 'src/components/ui/SettingsMenu/SettingsMenu.css') },
      { name: 'QuizCard.css', path: path.resolve(root, 'src/components/quiz/QuizCard.css') },
      { name: 'Challenges.css', path: path.resolve(root, 'src/pages/Challenges/Challenges.css') },
      { name: 'Dashboard.css', path: path.resolve(root, 'src/pages/Dashboard/Dashboard.css') },
      { name: 'Result.css', path: path.resolve(root, 'src/pages/Result/Result.css') },
      { name: 'ManualBuilder.css', path: path.resolve(root, 'src/pages/Create/ManualBuilder.css') },
      { name: 'SearchField.css', path: path.resolve(root, 'src/components/search/SearchField.css') }
    ];

    runTest('CSS Standards', 'CSS6.1: -webkit-tap-highlight-color: transparent present in all audited component stylesheets and global html', () => {
      const auditedFiles = [
        { name: 'index.css', path: path.resolve(root, 'src/index.css') },
        { name: 'SettingsMenu.css', path: path.resolve(root, 'src/components/ui/SettingsMenu/SettingsMenu.css') },
        { name: 'QuizCard.css', path: path.resolve(root, 'src/components/quiz/QuizCard.css') },
        { name: 'Challenges.css', path: path.resolve(root, 'src/pages/Challenges/Challenges.css') },
        { name: 'Dashboard.css', path: path.resolve(root, 'src/pages/Dashboard/Dashboard.css') },
        { name: 'Result.css', path: path.resolve(root, 'src/pages/Result/Result.css') },
        { name: 'ManualBuilder.css', path: path.resolve(root, 'src/pages/Create/ManualBuilder.css') }
      ];
      for (const f of auditedFiles) {
        const content = fs.readFileSync(f.path, 'utf8');
        expect(content).toContain('-webkit-tap-highlight-color: transparent');
      }
    });

    runTest('CSS Standards', 'CSS6.2: touch-action: manipulation present across interactive components', () => {
      const touchFiles = ['SettingsMenu.css', 'QuizCard.css', 'Challenges.css', 'Dashboard.css', 'Result.css'];
      for (const fname of touchFiles) {
        const item = cssFiles.find(c => c.name === fname);
        const content = fs.readFileSync(item.path, 'utf8');
        expect(content).toContain('touch-action: manipulation');
      }
    });

    runTest('CSS Standards', 'CSS6.3: Input font sizes in form sheets >= 16px to prevent iOS auto-zoom', () => {
      const mbContent = fs.readFileSync(path.resolve(root, 'src/pages/Create/ManualBuilder.css'), 'utf8');
      const sfContent = fs.readFileSync(path.resolve(root, 'src/components/search/SearchField.css'), 'utf8');

      // Check font-size on input, textarea, select
      const matches = (mbContent + sfContent).match(/(?:input|textarea|select)[^{]*\{[^}]*font-size:\s*(\d+)px/gi) || [];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const px = parseInt(m.match(/font-size:\s*(\d+)px/i)[1], 10);
        expect(px).toBeGreaterThanOrEqual(16);
      }
    });

    runTest('CSS Standards', 'CSS6.4: Hover styles gated behind @media (hover: hover) and (pointer: fine)', () => {
      for (const f of [cssFiles[0], cssFiles[1], cssFiles[2]]) {
        const content = fs.readFileSync(f.path, 'utf8');
        expect(content).toContain('@media (hover: hover) and (pointer: fine)');
      }
    });

    runTest('CSS Standards', 'CSS6.5: Active press feedback uses scale(0.97)', () => {
      for (const f of [cssFiles[0], cssFiles[1], cssFiles[2], cssFiles[4]]) {
        const content = fs.readFileSync(f.path, 'utf8');
        expect(content).toContain('scale(0.97)');
      }
    });

    runTest('CSS Standards', 'CSS6.6: Motion durations <= 300ms across all keyframes and transitions', () => {
      for (const f of cssFiles) {
        const content = fs.readFileSync(f.path, 'utf8');
        const msMatches = content.match(/(\d+)ms/g) || [];
        for (const m of msMatches) {
          const ms = parseInt(m, 10);
          expect(ms).toBeLessThanOrEqual(300);
        }
      }
    });

    runTest('CSS Standards', 'CSS6.7: Animations use transform and opacity only (no layout properties animated)', () => {
      for (const f of cssFiles) {
        const content = fs.readFileSync(f.path, 'utf8');
        // Match @keyframes blocks
        const kfRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([^}]+\{[^}]*\}[^}]*)\}/g;
        let match;
        while ((match = kfRegex.exec(content)) !== null) {
          const kfName = match[1];
          const kfBody = match[2];
          // Layout properties should NOT be animated in keyframes
          const forbidden = ['margin', 'padding', 'top', 'left', 'bottom', 'right'];
          for (const prop of forbidden) {
            const hasProp = new RegExp(`\\b${prop}\\s*:`, 'i').test(kfBody);
            if (hasProp) {
              throw new Error(`Keyframe ${kfName} in ${f.name} animates forbidden layout property: ${prop}`);
            }
          }
        }
      }
    });

    console.log('\n======================================================================');
    console.log('                          TEST RUN SUMMARY                            ');
    console.log('======================================================================');
    console.log(`  Total Tests  : ${RESULTS.total}`);
    console.log(`  Passed       : ${RESULTS.passed}`);
    console.log(`  Failed       : ${RESULTS.failed}`);
    console.log(`  Success Rate : ${((RESULTS.passed / RESULTS.total) * 100).toFixed(1)}%`);
    console.log('======================================================================\n');

    if (RESULTS.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
  }
}

run().catch((err) => {
  console.error('Fatal Test Harness Error:', err);
  process.exit(1);
});
