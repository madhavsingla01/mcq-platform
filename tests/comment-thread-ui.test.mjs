import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const app = new URL('../apps/desktop-web/', import.meta.url);
const require = createRequire(new URL('package.json', app));
const { JSDOM } = require('jsdom');
const { build } = require('esbuild');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5173',
  pretendToBeVisual: true,
});

for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, fireEvent, render, screen, waitFor } = require('@testing-library/react');
const create = React.createElement;

globalThis.commentThreadUiFixture = {
  auth: { user: { _id: 'reply-author', name: 'Reply author', username: 'replyauthor' }, isAuthenticated: true },
  comments: [{
    _id: 'root',
    body: 'Root comment',
    status: 'active',
    author: { _id: 'root-author', name: 'Root author', username: 'rootauthor' },
    replies: [{
      _id: 'reply',
      body: 'First reply',
      status: 'active',
      author: { _id: 'reply-author', name: 'Reply author', username: 'replyauthor' },
      replyToUser: { name: 'Root author', username: 'rootauthor' },
      replies: [{
        _id: 'nested',
        body: 'Nested reply',
        status: 'active',
        author: { _id: 'reply-author', name: 'Reply author', username: 'replyauthor' },
        replyToUser: { name: 'Reply author', username: 'replyauthor' },
        replies: [],
      }],
    }],
  }],
};

const mockModules = new Map([
  ['api', `
    const fixture = () => globalThis.commentThreadUiFixture;
    export default {
      get: async () => ({ data: { data: { comments: fixture().comments, totalComments: 3 } } }),
      delete: async () => ({ data: { success: true } }),
      post: async () => ({ data: { data: { comment: {} } } }),
      patch: async () => ({ data: { data: { comment: {} } } }),
    };
  `],
  ['auth', 'export const useAuthStore = () => globalThis.commentThreadUiFixture.auth;'],
  ['ui', 'import { jsx } from "react/jsx-runtime"; export const Spinner = () => null; export default { Spinner };'],
  ['confirm', `
    import { jsx } from "react/jsx-runtime";
    export default function ConfirmDeleteModal({ isOpen, onConfirm, message }) {
      return isOpen ? jsx("div", { children: [message, jsx("button", { key: "confirm", onClick: onConfirm, children: "Confirm delete" })] }) : null;
    }
  `],
  ['share', 'export default function ShareModal() { return null; }'],
  ['router', `
    import { jsx } from "react/jsx-runtime";
    export const Link = ({ to, children, ...props }) => jsx("a", { href: to, ...props, children });
    export const useNavigate = () => () => {};
  `],
  ['toast', 'export const toast = { error: () => {} };'],
]);

async function loadCommentsSection() {
  const result = await build({
    absWorkingDir: fileURLToPath(app),
    entryPoints: ['src/components/quiz/CommentsSection.jsx'],
    write: false,
    bundle: true,
    jsx: 'automatic',
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/jsx-runtime', 'lucide-react'],
    loader: { '.css': 'empty' },
    plugins: [{
      name: 'comment-thread-ui-fixtures',
      setup(builder) {
        const aliases = [
          [/\/api\/axios$/, 'api'],
          [/\/store\/authStore$/, 'auth'],
          [/\/components\/ui$/, 'ui'],
          [/\/ConfirmDeleteModal/, 'confirm'],
          [/\/ShareModal/, 'share'],
          [/^react-router-dom$/, 'router'],
          [/^sonner$/, 'toast'],
        ];
        for (const [filter, key] of aliases) {
          builder.onResolve({ filter }, () => ({ path: key, namespace: 'comment-ui-test' }));
        }
        builder.onLoad({ filter: /.*/, namespace: 'comment-ui-test' }, ({ path }) => ({
          contents: mockModules.get(path),
          loader: 'js',
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function('require', 'module', result.outputFiles[0].text)(require, module);
  return module.exports.default;
}

const CommentsSection = await loadCommentsSection();
afterEach(() => cleanup());
after(() => {
  delete globalThis.commentThreadUiFixture;
  dom.window.close();
});

test('comments reload with nested threads expanded and deleting a reply preserves its descendants', async () => {
  render(create(CommentsSection, { quizId: 'quiz-id', initialCount: 3 }));

  await screen.findByText('Root comment');
  await screen.findByText('First reply');
  await screen.findByText('Nested reply');

  fireEvent.click(screen.getAllByRole('button', { name: 'Delete reply' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

  await waitFor(() => {
    assert.equal(screen.getAllByText('Comment is deleted').length, 1);
    assert.ok(screen.getByText('Nested reply'));
  });
  assert.match(screen.getByRole('heading', { name: 'Discussion & Comments (3)' }).textContent, /3/);
});
