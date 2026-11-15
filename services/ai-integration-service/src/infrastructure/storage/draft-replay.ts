import type { mongo } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { draftSummary, type DraftSummary } from '../../application/draft-contracts.js';
import type { DraftReplay } from '../../application/ports/draft-core.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { DraftEvent, DraftEventType } from '../../application/draft-events.js';

export interface DraftOperation {
  _id: string;
  fingerprint: string;
  claim: string;
  expiresAt: Date;
  response?: DraftSummary;
  event?: DraftEvent;
  fanOut?: true;
}

const RETENTION_MS = 24 * 60 * 60 * 1000;

export class MongoDraftReplay implements DraftReplay {
  constructor(private readonly operations: mongo.Collection<DraftOperation>) {}

  async run(userId: string, key: string, fingerprint: string, write: () => Promise<DraftSummary>, type?: DraftEventType): Promise<DraftSummary> {
    const id = createHash('sha256').update(userId + ':' + key).digest('hex');
    const claim = randomUUID();
    try {
      await this.operations.insertOne({ _id: id, fingerprint, claim, expiresAt: new Date(Date.now() + RETENTION_MS) });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      const previous = await this.operations.findOne({ _id: id });
      if (previous && previous.fingerprint !== fingerprint) {
        throw new AppError('Use a new idempotency key for a different request', 409, 'IDEMPOTENCY_KEY_REUSED');
      }
      const response = draftSummary.safeParse(previous?.response);
      if (response.success) return response.data;
      throw new AppError('A request with this key is in progress or its outcome is unknown', 409, 'IDEMPOTENCY_PENDING');
    }

    let response: DraftSummary;
    try {
      response = await write();
    } catch (error) {
      // Keep ambiguous outcomes reserved. Core may have finished after a lost response.
      if (error instanceof AppError && error.statusCode < 500) {
        await this.operations.deleteOne({ _id: id, claim });
      }
      throw error;
    }
    const { kind, questionCount, updatedAt } = response;
    const event: DraftEvent | undefined = type ? { id: randomUUID(), type, ownerId: userId, version: 1,
      occurredAt: new Date(), data: { id: response.id, kind, questionCount, updatedAt } } : undefined;
    await this.operations.updateOne({ _id: id, claim }, { $set: { response, ...(event ? { event } : {}) } });
    return response;
  }
}

export async function connectDraftReplay(uri: string) {
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000, maxPoolSize: 5,
  }).asPromise();
  try {
    const db = connection.getClient().db(connection.name);
    const operations = db.collection<DraftOperation>('integration_draft_operations');
    await operations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await operations.createIndex({ fanOut: 1, 'event.occurredAt': 1 }, { partialFilterExpression: { 'event.occurredAt': { $exists: true } } });
    return { db, operations, replay: new MongoDraftReplay(operations), close: () => connection.close() };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
