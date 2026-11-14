// Starts the real services against an ephemeral LOCAL MongoDB. Never reads an
// application database URI, never drops a database, and never prints secrets.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['api-gateway','auth-service','quiz-service','parser-service','attempt-service','social-service','social-feed-service','social-interactions-service','social-comments-service','message-service','media-service','admin-service','challenge-service','marketplace-service','ai-integration-service'];
const serviceUrlKeys = {
  'api-gateway': 'GATEWAY_URL',
  'social-feed-service': 'SOCIAL_FEED_SERVICE_URL',
  'social-interactions-service': 'SOCIAL_INTERACTIONS_SERVICE_URL',
  'social-comments-service': 'SOCIAL_COMMENTS_SERVICE_URL',
  'ai-integration-service': 'AI_INTEGRATION_SERVICE_URL',
};
const entrypoints = {
  'api-gateway': 'dist/server.js',
  'admin-service': 'dist/server.js',
  'quiz-service': 'dist/server.js',
  'auth-service': 'dist/server.js',
  'attempt-service': 'dist/server.js',
  'challenge-service': 'dist/server.js',
  'media-service': 'dist/server.js',
  'social-feed-service': 'src/index.js',
  'social-interactions-service': 'src/index.js',
  'social-comments-service': 'src/index.js',
  'ai-integration-service': 'dist/main.js',
};
const children = [];
const logs = new Map();
const keepServing = process.argv.includes('--serve');
const testMedia = process.argv.includes('--media');
const testSecurity = process.argv.includes('--security');
const testProductionAuth = process.argv.includes('--production-auth');
const tempRoot = await realpath(tmpdir());
const temp = await mkdtemp(path.join(tempRoot, 'quizfocus-verify-'));
let stopping = false;
async function availablePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function launch(name, executable, args, options = {}) {
  const child = spawn(executable, args, { windowsHide: true, stdio: 'pipe', ...options });
  children.push(child);
  logs.set(name, '');
  const capture = data => logs.set(name, (logs.get(name) + data.toString()).slice(-12000));
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', error => capture(error.message));
  child.on('exit', (code, signal) => capture(`\nProcess exit: ${code}, signal: ${signal}\n`));
  return child;
}
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.reverse().map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, 'exit').catch(() => {});
    child.kill('SIGTERM');
    const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
    deadline.unref();
    await ended;
    clearTimeout(deadline);
  }));
  const resolved = await realpath(temp);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('quizfocus-verify-')) {
    throw new Error('Verification cleanup target is outside its temporary directory.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
}
process.once('SIGINT', async () => { await stop(); process.exit(130); });
process.once('SIGTERM', async () => { await stop(); process.exit(143); });

try {
  for (const service of ['api-gateway', 'ai-integration-service', 'media-service', 'auth-service', 'challenge-service', 'attempt-service', 'admin-service', 'quiz-service']) {
    const directory = path.join(root, 'services', service);
    const build = spawn(process.execPath, [
      path.join(directory, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      path.join(directory, 'tsconfig.json'),
    ], { cwd: directory, env: process.env, stdio: 'inherit', windowsHide: true });
    const [buildCode] = await once(build, 'exit');
    if (buildCode !== 0) throw new Error(`Failed to build ${service} before starting the isolated stack.`);
  }

  await mkdir(path.join(temp, 'db'));
  const mongoPort = await availablePort();
  launch('mongo', process.env.MONGOD_BINARY || 'mongod', ['--dbpath', path.join(temp, 'db'), '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--quiet']);
  const ports = {};
  for (const name of names) ports[name] = await availablePort();
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/quizfocus_verification`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173,http://127.0.0.1:5183',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5183',
    MONGO_URI: mongoUri, AUTH_MONGO_URI: mongoUri, QUIZ_MONGO_URI: mongoUri, ATTEMPT_MONGO_URI: mongoUri, MEDIA_CONTENT_MONGO_URI: mongoUri,
    JWT_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    JWT_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
    MAX_IMPORT_ROWS: '10000', CACHE_DEFAULT_TTL_MS: '30000', CACHE_SHORT_TTL_MS: '15000', CACHE_SEARCH_TTL_MS: '60000',
    MAX_FILE_SIZE_GUEST: '20480', MAX_FILE_SIZE_AUTH: '10485760', MEDIA_MAX_FILE_SIZE: '12582912',
    MEDIA_STORAGE_PATH: path.join(temp, 'media'), ADMIN_EMAIL: 'verification@example.test', HEALTH_CHECK_TIMEOUT_MS: '2500',
    CHALLENGE_LIST_DEFAULT_PAGE_SIZE: '12', CHALLENGE_LIST_MAX_PAGE_SIZE: '50', LEADERBOARD_CACHE_TTL_SECONDS: '15',
    HEALTH_CACHE_TTL_MS: '200', MONGO_MAX_POOL_SIZE: '5',
  };
  for (const name of names) {
    const key = serviceUrlKeys[name] || `${name.replace('-service','').toUpperCase()}_SERVICE_URL`;
    env[key] = `http://127.0.0.1:${ports[name]}`;
  }
  env.API_GATEWAY_URL = env.GATEWAY_URL;
  for (const name of names) {
    const mode = testProductionAuth && name === 'auth-service' ? 'production'
      : ['media-service', 'marketplace-service'].includes(name) ? 'development' : 'test';
    launch(name, process.execPath, [entrypoints[name] || 'src/server.js'], { cwd: path.join(root, 'services', name), env: { ...env, NODE_ENV: mode, PORT: String(ports[name]) } });
  }
  let ready = false;
  for (let tries = 0; tries < 240; tries++) {
    if (children.some(child => child.exitCode !== null)) break;
    try {
      const response = await fetch(`${env.GATEWAY_URL}/api/v1/readyz`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Isolated stack did not become ready. Check the service logs below and the MONGOD_BINARY setting.');
  console.log(`Isolated stack ready: ${env.GATEWAY_URL}`);
  if (keepServing) {
    await mkdir(path.join(root, '.runtime'), { recursive: true });
    await writeFile(path.join(root, '.runtime', 'verification.json'), JSON.stringify({ gateway: env.GATEWAY_URL, ports, mongoUri }, null, 2));
    if (testMedia) {
      const { ApiClient } = await import('../tests/e2e/helpers/api-client.js');
      const { audioQuestion, gestureQuestion, publishSample } = await import('../tests/fixtures/media/samples.mjs');
      const creator = new ApiClient(env.GATEWAY_URL), participant = new ApiClient(env.GATEWAY_URL);
      const viewer = await participant.registerTestUser('mediaviewer');
      const author = await creator.registerTestUser('mediacreator');
      const spoken = await publishSample(creator, 'Sample · Spoken arithmetic', await audioQuestion(creator));
      const gesture = await publishSample(creator, 'Sample · Match a hand motion', await gestureQuestion(creator));
      console.log(`Disposable creator: ${author.email} / ${author.password}\nDisposable participant: ${viewer.email} / ${viewer.password}\nQuiz paths: /quiz/${spoken} and /quiz/${gesture}`);
    }
    console.log('Serving disposable test data; Ctrl+C stops only these child processes.');
    await new Promise(() => {});
  } else {
    const securitySuite = 'tests/integration/identity-security.test.mjs';
    const suites = testProductionAuth ? [['--test', 'tests/integration/production-auth.test.mjs']]
      : testMedia ? [['--test', 'tests/integration/accessible-media.test.mjs']]
      : testSecurity ? [['--test', securitySuite, 'tests/integration/platform-architecture.test.mjs']]
        : [['tests/e2e/runner.js'], ['--test', 'tests/integration/chat-settings.test.mjs', 'tests/integration/platform-architecture.test.mjs', securitySuite]];
    if (!testProductionAuth && !testMedia && !testSecurity) {
      const { ApiClient } = await import('../tests/e2e/helpers/api-client.js');
      const { createRequire } = await import('node:module');
      const authRequire = createRequire(new URL('../services/auth-service/package.json', import.meta.url));
      const { MongoClient, ObjectId } = authRequire('mongoose').mongo;
      const client = new ApiClient(env.GATEWAY_URL);
      const testAdmin = await client.registerTestUser('isolated_admin');
      const mongo = new MongoClient(mongoUri);
      try {
        await mongo.connect();
        const update = await mongo.db().collection('users').updateOne(
          { _id: new ObjectId(testAdmin.userId) }, { $set: { role: 'admin' } },
        );
        if (update.modifiedCount !== 1) throw new Error('Could not provision isolated test administrator');
      } finally {
        await mongo.close();
      }
      env.QUIZFOCUS_TEST_ADMIN_EMAIL = testAdmin.email;
      env.QUIZFOCUS_TEST_ADMIN_PASSWORD = testAdmin.password;
    }
    for (const args of suites) {
      const runner = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
      children.push(runner);
      const [code] = await once(runner, 'exit');
      if (code !== 0) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error.message);
  // Logs from this isolated stack contain only newly generated test configuration.
  for (const [name, output] of logs) if (output) console.error(`[${name}] ${output.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  if (!keepServing || process.exitCode) await stop();
}
