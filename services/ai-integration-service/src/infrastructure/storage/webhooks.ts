import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { mongo } from 'mongoose';
import type { DraftEvent, DraftEventType } from '../../application/draft-events.js';
import type { DraftOperation } from './draft-replay.js';
import { AppError } from '../../shared/errors/app-error.js';
import { deliverWebhook, webhookDestination, webhookSecret } from '../http/webhook-delivery.js';

interface Subscription {
  _id: string;
  ownerId: string;
  events: DraftEventType[];
  encryptedUrl: string;
  destinationHash: string;
  origin: string;
  createdAt: Date;
  disabledAt?: Date;
}
interface Delivery {
  _id: string;
  subscriptionId: string;
  ownerId: string;
  event: DraftEvent;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  nextAt: Date;
  expiresAt: Date;
  lease?: string;
  lastStatus?: number;
  audit?: { at: Date; status: number | null }[];
}

const lifetime = 30 * 86_400_000;
function encryptionKey(secret: string) {
  return createHmac('sha256', secret).update('quizfocus:webhook:encryption:v1').digest();
}
function encryptDestination(input: string, secret: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), nonce);
  const encrypted = Buffer.concat([cipher.update(input, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function decryptDestination(encrypted: string, secret: string) {
  const bytes = Buffer.from(encrypted, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
export class Webhooks {
  private readonly subscriptions: mongo.Collection<Subscription>;
  private readonly deliveries: mongo.Collection<Delivery>;

  constructor(db: mongo.Db, private readonly operations: mongo.Collection<DraftOperation>,
    private readonly secret: string, private readonly origins: readonly string[],
    private readonly deliver = deliverWebhook) {
    this.subscriptions = db.collection('integration_webhook_subscriptions');
    this.deliveries = db.collection('integration_webhook_deliveries');
  }

  async initialize() {
    await Promise.all([
      this.subscriptions.createIndex({ ownerId: 1, createdAt: -1 }),
      this.subscriptions.createIndex({ ownerId: 1, destinationHash: 1 }, { unique: true, partialFilterExpression: { disabledAt: null } }),
      this.deliveries.createIndex({ ownerId: 1, subscriptionId: 1, nextAt: -1 }),
      this.deliveries.createIndex({ status: 1, nextAt: 1 }),
      this.deliveries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }

  async list(ownerId: string) {
    const subscriptions = await this.subscriptions.find({ ownerId, disabledAt: { $exists: false } })
      .sort({ createdAt: -1 }).limit(20).toArray();
    return subscriptions.map(({ _id, createdAt, events, origin }) => ({
      id: _id, createdAt, events, destination: origin,
    }));
  }

  async create(ownerId: string, rawUrl: string, events: DraftEventType[]) {
    const destination = webhookDestination(rawUrl, this.origins);
    if (await this.subscriptions.countDocuments({ ownerId, disabledAt: { $exists: false } }) >= 20) {
      throw new AppError('Webhook subscription limit reached', 409, 'SUBSCRIPTION_LIMIT');
    }
    const id = randomUUID();
    try {
      await this.subscriptions.insertOne({ _id: id, ownerId, events, origin: destination.origin,
        destinationHash: createHmac('sha256', this.secret).update('destination:' + destination.href).digest('hex'),
        encryptedUrl: encryptDestination(destination.href, this.secret), createdAt: new Date() });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        throw new AppError('An active subscription already uses this destination', 409, 'SUBSCRIPTION_EXISTS');
      }
      throw error;
    }
    return { id, events, signingSecret: webhookSecret(this.secret, id) };
  }

  async disable(ownerId: string, id: string) {
    const result = await this.subscriptions.updateOne({ _id: id, ownerId }, { $set: { disabledAt: new Date() } });
    if (!result.matchedCount) throw new AppError('Webhook subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
    return { id, disabled: true };
  }

  async history(ownerId: string, id: string) {
    if (!await this.subscriptions.findOne({ _id: id, ownerId }, { projection: { _id: 1 } })) {
      throw new AppError('Webhook subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
    }
    const records = await this.deliveries.find({ ownerId, subscriptionId: id }).sort({ nextAt: -1 }).limit(50).toArray();
    return records.map(({ _id, attempts, status, event, audit }) => ({
      id: _id, eventId: event.id, type: event.type, attempts, status, audit: audit ?? [],
    }));
  }

  async tick() {
    const pending = await this.operations.find({ fanOut: { $ne: true }, 'event.occurredAt': { $exists: true } })
      .sort({ 'event.occurredAt': 1 }).limit(25).toArray();
    for (const { _id, event } of pending) {
      if (!event) continue;
      const targets = await this.subscriptions.find({ ownerId: event.ownerId, events: event.type,
        createdAt: { $lte: event.occurredAt }, disabledAt: { $exists: false } }).limit(20).toArray();
      for (const target of targets) {
        await this.deliveries.updateOne({ _id: event.id + '.' + target._id }, { $setOnInsert: {
          subscriptionId: target._id, ownerId: event.ownerId, event, status: 'pending',
          attempts: 0, nextAt: new Date(), expiresAt: new Date(Date.now() + lifetime),
        } }, { upsert: true });
      }
      await this.operations.updateOne({ _id, 'event.id': event.id }, { $set: { fanOut: true } });
    }
    for (let count = 0; count < 8; count++) {
      const lease = randomUUID();
      const delivery = await this.deliveries.findOneAndUpdate({ status: 'pending', nextAt: { $lte: new Date() } }, {
        $set: { lease, nextAt: new Date(Date.now() + 60_000) },
      }, { sort: { nextAt: 1 }, returnDocument: 'after' });
      if (!delivery) break;
      await this.send(delivery, lease);
    }
  }

  private async send(delivery: Delivery, lease: string) {
    const target = await this.subscriptions.findOne({ _id: delivery.subscriptionId, ownerId: delivery.ownerId, disabledAt: { $exists: false } });
    const query = { _id: delivery._id, lease };
    if (!target) {
      await this.deliveries.updateOne(query, { $set: { status: 'cancelled' }, $unset: { lease: 1 } });
      return;
    }
    const { id, type, version, occurredAt, data } = delivery.event;
    let status: number | null = null;
    try {
      status = await this.deliver(webhookDestination(decryptDestination(target.encryptedUrl, this.secret), this.origins),
        JSON.stringify({ id, type, version, occurredAt, data }), delivery._id, webhookSecret(this.secret, target._id));
    } catch {
      // Keep only delivery outcome. Destination URLs can contain secrets.
    }
    const sent = status !== null && status >= 200 && status < 300;
    const retry = status === null || status === 408 || status === 429 || status >= 500;
    const attempts = delivery.attempts + 1;
    const nextAt = new Date(Date.now() + Math.min(60_000 * 2 ** (attempts - 1), 3_600_000));
    await this.deliveries.updateOne(query, {
      $set: { status: sent ? 'sent' : retry && attempts < 6 ? 'pending' : 'failed', attempts, nextAt },
      $push: { audit: { at: new Date(), status } }, $unset: { lease: 1 },
    });
  }
}
