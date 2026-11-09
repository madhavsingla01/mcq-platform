import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { withMediaIds, reorderBuilderOption, fillBuilderOptions, firstMediaIssue } from '../apps/desktop-web/src/utils/builderMediaState.js';

test('quick fill preserves existing choice content, media, and correctness', () => {
  const question = withMediaIds({
    type: 'multiple_choice', options: ['Original', '', '', ''], optionIds: ['a', 'b', 'c', 'd'],
    optionMedia: { b: [{ kind: 'video', assetId: 'clip-b' }] }, correctIndex: 1,
  });
  const preset = fillBuilderOptions(question, ['A', 'B', 'C', 'D'], true);
  assert.deepEqual(preset.options, ['Original', '', 'C', 'D']);
  const custom = fillBuilderOptions(question, ['First', 'Second', 'Third']);
  assert.deepEqual(custom.options, ['Original', '', 'First', 'Second', 'Third']);
  assert.deepEqual(custom.optionIds.slice(0, 4), question.optionIds);
  assert.equal(new Set(custom.optionIds).size, 5);
  assert.equal(custom.correctIndex, 1);
  assert.equal(custom.optionMedia, question.optionMedia);
  assert.equal(fillBuilderOptions(question, Array(9).fill('Too many')), question);
});

const app = new URL('../apps/desktop-web/', import.meta.url);
const require = createRequire(new URL('package.json', app));
const { JSDOM } = require('jsdom');
const { build } = require('esbuild');
const dom = new JSDOM('<!doctype html><html lang="en"><title>Quiz accessibility check</title><body></body></html>', {
  url: 'http://localhost:5173', pretendToBeVisual: true, runScripts: 'outside-only',
});
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// user-event needs CSS.escape to find radios by name. The fixture group names
// contain only CSS identifier characters.
dom.window.CSS ??= { escape: value => value };
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
const paused = new Set();
dom.window.HTMLMediaElement.prototype.pause = function () { paused.add(this); };
dom.window.HTMLMediaElement.prototype.play = async function () {
  this.dispatchEvent(new dom.window.Event('play', { bubbles: true }));
};

const React = require('react');
const { act, render, screen, fireEvent, within, waitFor, cleanup } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
const create = React.createElement;
const clipCalls = [];
let uploadClip;
globalThis.quizMediaUiTestTransport = {
  clipAccess: async (ids, context) => {
    clipCalls.push({ ids, context });
    return Object.fromEntries(ids.map(id => [id, { url: '/clip/' + id }]));
  },
  clipCapabilities: async () => ({ maxFileSize: 10485760, maxCaptionSize: 262144, maxDurationSeconds: 300, processorReady: true }),
  uploadClip: (...args) => uploadClip(...args),
};

async function loadComponent(relativePath) {
  const result = await build({
    absWorkingDir: fileURLToPath(app), entryPoints: [relativePath], write: false, bundle: true,
    jsx: 'automatic', platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'], loader: { '.css': 'empty' },
    plugins: [{
      name: 'media-api-fixture',
      setup(builder) {
        builder.onResolve({ filter: /\/services\/media\.service$/ }, () => ({ path: 'transport', namespace: 'quiz-media-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'quiz-media-test' }, () => ({
          contents: 'export const MediaService = globalThis.quizMediaUiTestTransport;',
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function('require', 'module', result.outputFiles[0].text)(require, module);
  return module.exports.default;
}

const [OptionCard, MediaEditor] = await Promise.all([
  loadComponent('src/components/platform/options/OptionCard.jsx'),
  loadComponent('src/components/media/MediaEditor.jsx'),
]);
dom.window.eval(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'));
afterEach(() => { cleanup(); paused.clear(); clipCalls.length = 0; });
after(() => dom.window.close());

const audio = (id, label, transcript) => ({ kind:'audio', assetId:id, label, transcript, equivalenceReviewed:true });
const options = [
  { optionId: 'choice-a', label:'A', text:'', accessibilityMedia:[audio('audio-a','Option A audio','Two.')] },
  { optionId: 'choice-b', label:'B', text:'', accessibilityMedia:[{
    kind:'video', assetId:'video-b', label:'Option B video', transcript:'Four.', captionAssetId:'caption-b',
    describedAssetId:'described-b', describedCaptionAssetId:'described-caption-b', captionLanguage:'en',
  }] },
];

test('keyboard selection is separate from media, and text stays usable after playback fails', async () => {
  function Question() {
    const [selected, setSelected] = React.useState('');
    return create('main', null, create('h1', null, 'Question 1'),
      create('fieldset', null, create('legend', null, 'Choose one answer'), options.map(option => create(OptionCard, {
        key: option.optionId, option, isSelected:selected === option.optionId, onSelect:setSelected,
        questionId:'question', quizId:'quiz', attemptId:'attempt',
      }))));
  }
  const user = userEvent.setup();
  render(create(Question));
  const choiceA = screen.getByRole('radio', { name: 'A. Option A audio' });
  const choiceB = screen.getByRole('radio', { name: 'B. Option B video' });
  await user.tab();
  assert.equal(document.activeElement, choiceA);
  await user.keyboard(' ');
  assert.equal(choiceA.checked, true);
  const video = await screen.findByLabelText('Option B video', { selector: 'video' });
  const audioPlayer = await screen.findByLabelText('Option A audio', { selector: 'audio' });
  assert.equal(video.autoplay, false);
  assert.equal(video.preload, 'none');
  fireEvent.play(video);
  assert.equal(choiceA.checked, true);
  assert.equal(choiceB.checked, false);
  assert.equal(document.activeElement, choiceA);
  assert.ok(paused.has(audioPlayer));
  assert.equal(video.querySelector('track').getAttribute('src'), '/clip/caption-b');
  await user.click(screen.getByRole('button', { name:'Use audio-described video' }));
  assert.equal(video.getAttribute('src'), '/clip/described-b');
  assert.equal(video.querySelector('track').getAttribute('src'), '/clip/described-caption-b');
  assert.equal(choiceA.checked, true);
  const focused = document.activeElement;
  fireEvent.error(video);
  assert.equal(document.activeElement, focused);
  assert.match(screen.getByRole('status').textContent, /could not load/);
  await user.click(screen.getByText('Transcript and visual description'));
  assert.equal(screen.getByText('Four.').closest('details').open, true);
  assert.equal(choiceA.checked, true);
  await user.click(screen.getByRole('button',{name:'retry playback'}));
  await waitFor(()=>assert.equal(clipCalls.length,3));
  choiceA.focus();
  await user.keyboard('{ArrowRight}');
  assert.equal(choiceB.checked,true);
  assert.equal(choiceA.checked,false);
  const audit = await dom.window.axe.run(document, { rules: { 'color-contrast': { enabled:false } } });
  assert.deepEqual(Array.from(audit.violations, ({ id }) => id), []);
});

test('creator can retry a replacement and close its editor while the upload finishes', async () => {
  let latest;
  let finishReplacement;
  const attempts = [];
  uploadClip = async (file, kind, settings) => {
    attempts.push(settings.uploadRequestId);
    if (attempts.length === 1) throw new Error('interrupted');
    return new Promise(resolve => {
      finishReplacement = () => resolve({ _id:'new-asset', status:'ready', kind });
    });
  };
  function Editor({ active }) {
    const [clips, setClips] = React.useState([audio('ready-asset','Choice audio','Four.')]);
    latest = clips;
    return create(MediaEditor, { active, clips, onChange:setClips, text:'Four', contextLabel:'Question 1, option B' });
  }
  const user = userEvent.setup();
  const { container, rerender } = render(create(Editor, { active:true }));
  const input = screen.getByLabelText('Replace clip for Question 1, option B');
  await waitFor(()=>assert.equal(input.disabled,false));
  await user.upload(input, new dom.window.File(['fixture'],'replacement.wav',{type:'audio/wav'}));
  const retry = await screen.findByRole('button',{name:'Retry'});
  assert.equal(latest[0].assetId,'ready-asset');
  retry.focus();
  await user.keyboard('{Enter}');
  await waitFor(()=>assert.equal(attempts.length,2));
  rerender(create(Editor, { active:false }));
  assert.equal(screen.queryByLabelText('Audio transcript'),null);
  assert.equal(latest[0].assetId,'ready-asset');
  await act(async () => { finishReplacement(); });
  await waitFor(()=>assert.equal(latest[0].assetId,'new-asset'));
  await act(async () => { rerender(create(Editor, { active:true })); });
  assert.equal(attempts[0],attempts[1]);
  assert.equal(latest[0].equivalenceReviewed,false);
  assert.match(firstMediaIssue(latest,'Four'),/preserve the difficulty/);
  assert.ok(within(container).getByLabelText('Audio transcript'));
});

test('moving an answer preserves stable media and correctness in the builder', () => {
  const question = withMediaIds({ options:['Two','Four','Six'], optionIds:['a','b','c'], correctIndex:1, optionMedia:{ b:[audio('four','Spoken answer','Four.')] } });
  const moved = reorderBuilderOption(question,1,0);
  assert.deepEqual(moved.optionIds,['b','a','c']);
  assert.equal(moved.correctIndex,0);
  assert.equal(moved.optionMedia[moved.optionIds[moved.correctIndex]][0].assetId,'four');
});
