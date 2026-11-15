import { createHmac } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP, isIPv4 } from 'node:net';
import { AppError } from '../../shared/errors/app-error.js';

const blocked = new BlockList();
for (const [start, mask] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(start, mask);

export function webhookDestination(input: string, allowedOrigins: readonly string[]): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError('Invalid webhook destination', 400, 'INVALID_DESTINATION'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || isIP(host) ||
      !host.includes('.') || /\.(localhost|local)$/i.test(host) ||
      !allowedOrigins.includes(url.origin)) {
    throw new AppError('Choose an approved HTTPS webhook destination', 400, 'INVALID_DESTINATION');
  }
  return url;
}

export const webhookSecret = (key: string, subscriptionId: string) =>
  createHmac('sha256', key).update('quizfocus:webhook:' + subscriptionId).digest('base64url');

export const signWebhook = (secret: string, id: string, timestamp: string, payload: string) =>
  'v1=' + createHmac('sha256', secret).update(id + '.' + timestamp + '.' + payload).digest('hex');

export async function deliverWebhook(url: URL, body: string, id: string, secret: string) {
  const addresses = await new Resolver({ timeout: 1500, tries: 2 }).resolve4(url.hostname);
  const address = addresses[0];
  if (!address || addresses.some(value => !isIPv4(value) || blocked.check(value))) throw new Error('Destination unavailable');
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Promise<number>((resolve, reject) => {
    const peer = request(url, {
      method: 'POST', agent: false, family: 4, signal: AbortSignal.timeout(5000),
      // Pin the resolved IP for the connection while keeping TLS verification on the original host.
      lookup: (_host, _options, callback) => callback(null, address, 4),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'Webhook-Id': id, 'Webhook-Timestamp': timestamp, 'Webhook-Signature': signWebhook(secret, id, timestamp, body) },
    }, response => {
      response.destroy();
      resolve(response.statusCode || 502);
    });
    peer.on('error', reject);
    peer.end(body);
  });
}
