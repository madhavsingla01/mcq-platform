/**
 * QuizFocus Microservices Orchestrator
 * Spawns and supervises configured application services, including the API gateway.
 * Service ports are read from each service's local .env file.
 */

import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const readPort = (serviceName) => {
  const envPath = path.join(root, 'services', serviceName, '.env');
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}; copy the service .env.example and configure it first.`);
  const portLine = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((line) => /^\s*PORT\s*=/.test(line));
  const port = Number(portLine?.split('=', 2)[1]?.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${serviceName} requires a valid PORT in its .env file.`);
  return port;
};

const SERVICES = [
  { name: 'auth-service', label: 'AUTH', color: '\x1b[36m' },
  { name: 'quiz-service', label: 'QUIZ', color: '\x1b[32m' },
  { name: 'parser-service', label: 'PARSER', color: '\x1b[33m' },
  { name: 'attempt-service', label: 'ATTEMPT', color: '\x1b[35m' },
  { name: 'social-service', label: 'SOCIAL', color: '\x1b[34m' },
  { name: 'message-service', label: 'MESSAGE', color: '\x1b[38;5;208m' },
  { name: 'media-service', label: 'MEDIA', color: '\x1b[38;5;141m' },
  { name: 'admin-service', label: 'ADMIN', color: '\x1b[38;5;214m' },
  { name: 'challenge-service', label: 'CHALLENGE', color: '\x1b[38;5;178m' },
  { name: 'api-gateway', label: 'GATEWAY', color: '\x1b[31m' },
].map((service) => ({ ...service, port: readPort(service.name) }));

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
