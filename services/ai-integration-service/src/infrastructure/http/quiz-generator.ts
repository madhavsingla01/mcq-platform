import type { mongo } from 'mongoose';
import type { GenerationUsage, QuizGenerator } from '../../application/authoring-import.js';
import { AppError } from '../../shared/errors/app-error.js';
import { readBoundedJson } from './read-json.js';

export class HttpQuizGenerator implements QuizGenerator {
  constructor(private readonly url: string, private readonly token: string) {}
  async generate(request: Parameters<QuizGenerator['generate']>[0]): Promise<unknown> {
    try {
      const response = await fetch(this.url, {
        method: 'POST', signal: AbortSignal.timeout(20_000), redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
        body: JSON.stringify({ schema: 'quizfocus.mcq-generation.v1', ...request }),
      });
      return await readBoundedJson(response, 128 * 1024);
    } catch {
      throw new AppError('Quiz generation provider is temporarily unavailable', 503, 'GENERATION_UNAVAILABLE');
    }
  }
}

interface UsageRow { _id: string; expiresAt: Date; requests: number }
export class MongoGenerationUsage implements GenerationUsage {
  private readonly usage: mongo.Collection<UsageRow>;
  constructor(db: mongo.Db, private readonly limit: number) {
    this.usage = db.collection('integration_generation_usage');
  }
  async initialize() {
    await this.usage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
  async claim(account: string) {
    const day = new Date().toISOString().slice(0, 10);
    const _id = account + ':' + day;
    try {
      await this.usage.updateOne({ _id, requests: { $lt: this.limit } },
        { $inc: { requests: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 30 * 86_400_000) } }, { upsert: true });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        // Concurrent first usage can race with the upsert. Retry the bounded increment once.
        const retry = await this.usage.updateOne({ _id, requests: { $lt: this.limit } }, { $inc: { requests: 1 } });
        if (retry.modifiedCount === 1) return;
        throw new AppError('Daily generation limit reached', 429, 'GENERATION_LIMIT');
      }
      throw error;
    }
  }
}
