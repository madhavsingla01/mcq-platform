/**
 * QuizFocus Microservices Orchestrator
 * Spawns and supervises all 8 application services including the API gateway:
 *  - api-gateway (5000)
 *  - auth-service (5001)
 *  - quiz-service (5002)
 *  - parser-service (5003)
 *  - attempt-service (5004)
 *  - social-service (5005)
 *  - message-service (5006)
 *  - media-service (5007)
 */

import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const SERVICES = [
  { name: 'auth-service', port: 5001, label: 'AUTH', color: '\x1b[36m' },
  { name: 'quiz-service', port: 5002, label: 'QUIZ', color: '\x1b[32m' },
  { name: 'parser-service', port: 5003, label: 'PARSER', color: '\x1b[33m' },
  { name: 'attempt-service', port: 5004, label: 'ATTEMPT', color: '\x1b[35m' },
  { name: 'social-service', port: 5005, label: 'SOCIAL', color: '\x1b[34m' },
  { name: 'message-service', port: 5006, label: 'MESSAGE', color: '\x1b[38;5;208m' },
  { name: 'media-service', port: 5007, label: 'MEDIA', color: '\x1b[38;5;141m' },
  { name: 'admin-service', port: 5008, label: 'ADMIN', color: '\x1b[38;5;214m' },
  { name: 'api-gateway', port: 5000, label: 'GATEWAY', color: '\x1b[31m' },
];

const children = [];

function log(label, color, message) {
  const reset = '\x1b[0m';
  const gray = '\x1b[90m';
  const lines = message.toString().trim().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(`${color}[${label}]${reset} ${line}`);
    }
  }
}

function startService(svc) {
  const cwd = path.join(root, 'services', svc.name);
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd,
    env: { ...process.env, PORT: svc.port },
    shell: isWindows,
  });

  child.stdout.on('data', (d) => log(svc.label, svc.color, d));
  child.stderr.on('data', (d) => log(svc.label, svc.color, d));
  child.on('error', (error) => {
    log(svc.label, svc.color, `Failed to start: ${error.message}`);
  });

  child.on('close', (code) => {
    log(svc.label, svc.color, `Process exited with code ${code}`);
  });

  children.push(child);
  return child;
}

const isPortAvailable = (port) => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      resolve(false);
      return;
    }
    reject(error);
  });
  server.listen(port, () => {
    server.close((error) => error ? reject(error) : resolve(true));
  });
});

const startAllServices = async () => {
  const occupiedPorts = [];
  for (const service of SERVICES) {
    if (!await isPortAvailable(service.port)) {
      occupiedPorts.push(`${service.port} (${service.label})`);
    }
  }

  if (occupiedPorts.length) {
    console.error(`Cannot start services; these ports are already in use: ${occupiedPorts.join(', ')}`);
    console.error('Stop the existing processes or configure a different port before retrying.');
    process.exitCode = 1;
    return;
  }

  console.log('🚀 Starting all QuizFocus services...\n');
  for (const service of SERVICES) startService(service);
};

startAllServices().catch((error) => {
  console.error('Failed to check service ports:', error);
  process.exitCode = 1;
});

// Graceful cleanup
let isShuttingDown = false;
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Shutting down all microservices...');
  const shutdowns = children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    if (process.platform !== 'win32') {
      child.kill('SIGINT');
      child.once('close', resolve);
      return;
    }

    const childClosed = new Promise((childResolve) => child.once('close', childResolve));
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    killer.once('error', (error) => {
      console.error(`Failed to stop service process ${child.pid}: ${error.message}`);
      child.kill();
      resolve();
    });
    killer.once('close', (code) => {
      if (code !== 0) console.error(`taskkill failed for service process ${child.pid} (exit ${code}).`);
      resolve();
    });
    childClosed.then(resolve);
  }));

  Promise.all(shutdowns).then(() => {
    process.exitCode = 0;
  });
}

process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
