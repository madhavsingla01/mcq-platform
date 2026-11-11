import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const execFileAsync = promisify(execFile);
const generatedMediaDirectory = path.join(tmpdir(), `quizfocus-media-test-fixtures-${process.pid}`);
const generatedMedia = new Set([
  'spoken-question.wav',
  'choice-a.wav',
  'choice-b.wav',
  'choice-c.wav',
  'choice-d.wav',
  'gesture-prompt.mp4',
  'gesture-a.mp4',
  'gesture-b.mp4',
  'gesture-c.mp4',
  'gesture-d.mp4',
  'spoken-video.mp4',
  'spoken-video-described.mp4',
]);
const mediaGenerations = new Map();

const types = {
  wav: 'audio/wav',
  mp4: 'video/mp4',
  vtt: 'text/vtt',
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function ensureGeneratedMedia(name) {
  if (!mediaGenerations.has(name)) {
    mediaGenerations.set(name, (async () => {
      await mkdir(generatedMediaDirectory, { recursive: true });
      const ffmpeg = process.env.MEDIA_FFMPEG_PATH || 'ffmpeg';
      const index = [...generatedMedia].indexOf(name);
      const output = path.join(generatedMediaDirectory, name);
      const input = name.endsWith('.wav')
        ? ['-f', 'lavfi', '-i', `sine=frequency=${440 + index * 40}:duration=2`]
        : [
            '-f', 'lavfi', '-i', `color=c=${['white', 'gray', 'blue', 'green'][index % 4]}:s=320x240:r=24:d=2`,
            '-f', 'lavfi', '-i', `sine=frequency=${440 + index * 40}:duration=2`,
          ];
      const encoding = name.endsWith('.wav')
        ? ['-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '1']
        : ['-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'];

      await execFileAsync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...input, ...encoding, output], {
        windowsHide: true,
        timeout: 30000,
      });
    })());
  }

  await mediaGenerations.get(name);
}

export async function uploadFixture(client, name, { kind, key = randomUUID(), endpoint = '/api/v1/media/clips', bytes } = {}) {
  const form = new FormData();
  const fixturePath = generatedMedia.has(name)
    ? (await ensureGeneratedMedia(name), path.join(generatedMediaDirectory, name))
    : new URL(name, import.meta.url);
  form.append('file', new Blob([bytes ?? await readFile(fixturePath)], {
    type: types[name.split('.').at(-1)],
  }), name);
  if (kind) {
    form.append('kind', kind);
    form.append('uploadRequestId', key);
  }
  const response = await fetch(client.baseUrl + endpoint, {
    method: 'POST', headers: { Cookie: client._buildCookieHeader(), 'x-csrf-token': client.getCookie('csrfToken') },
    body: form, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, data: await response.json() };
}

export async function readyFixture(author, name, kind) {
  const { status, data } = await uploadFixture(author, name, { kind });
  if (status !== 201 && status !== 202) throw new Error(`Upload of ${name} returned ${status}: ${data.message}`);
  let asset = data.data.asset;
  const expires = Date.now() + 30000;
  while (asset.status !== 'ready' && Date.now() < expires) {
    if (asset.status === 'failed') throw new Error(`Fixture ${name} failed processing`);
    await delay(250);
    const response = await author.get(`/api/v1/media/clips/${asset._id}`, { expectedStatus: 200 });
    asset = response.data.data.asset;
  }
  if (asset.status !== 'ready') throw new Error(`Fixture ${name} did not finish processing`);
  return asset;
}

export function clip(kind, assetId, label, transcript, fields = {}) {
  return { kind, assetId, label, transcript, equivalenceReviewed: true, ...fields };
}

async function sampleQuestion(author, kind, prompts, choices, purpose) {
  const files = [prompts[0], ...choices.map(choice => choice[0])];
  const assets = [];
  // Keep the same upload limit and processing flow as the builder.
  for (const filename of files) assets.push(await readyFixture(author, filename, kind));
  return {
    questionType: 'multiple_choice', questionText: prompts[1],
    accessibilityMedia: [clip(kind, assets[0]._id, kind === 'audio' ? 'Spoken question' : 'Prompt hand motion', prompts[2], { purpose })],
    options: choices.map(([, transcript], index) => {
      const label = String.fromCharCode(65 + index);
      return {
        label, text: '', optionId: randomUUID(), isCorrect: index === 1,
        accessibilityMedia: [clip(kind, assets[index+1]._id, `Option ${label} ${kind}`, transcript, { purpose })],
      };
    }),
    correctAnswer: 'B', marks: 1,
  };
}

export function audioQuestion(author) {
  return sampleQuestion(author, 'audio', ['spoken-question.wav', '', 'What is two plus two?'], [
    ['choice-a.wav','Two.'], ['choice-b.wav','Four.'], ['choice-c.wav','Six.'], ['choice-d.wav','Eight.'],
  ], 'speech');
}

export function gestureQuestion(author) {
  const movement = count => Array.from({ length: count }, () => 'The four fingers bend toward the palm, pause, and straighten.').join(' ');
  return sampleQuestion(author, 'video', ['gesture-prompt.mp4', 'Which option repeats the same hand-motion sequence as the prompt?', movement(2)],
    ['a','b','c','d'].map((letter, index) => [`gesture-${letter}.mp4`, movement(index+1)]), 'gesture');
}

export async function publishSample(author, title, question, settings = {}) {
  const draft = await author.post('/api/v1/quiz/manual', { title, questions: [question], isDraft: true, settings }, { expectedStatus: 201 });
  const id = draft.data.data.quizId;
  await author.post(`/api/v1/quiz/drafts/${id}/publish`, { visibility: 'public' }, { expectedStatus: 200 });
  return id;
}
