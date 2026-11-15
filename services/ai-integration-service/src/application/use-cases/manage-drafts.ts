import { createHash } from 'node:crypto';
import type { CreateDraft, DraftQuery, PatchDraft, DraftQuestion } from '../draft-contracts.js';
import type { DraftContext, DraftCore, DraftReplay } from '../ports/draft-core.js';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = Object.entries(value).filter(([, field]) => field !== undefined);
    return '{' + object.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, field]) => JSON.stringify(key) + ':' + canonicalJson(field)).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

export const fingerprint = (method: string, id: string | null, payload: unknown) =>
  createHash('sha256').update(canonicalJson([method, id, payload])).digest('hex');

export class ManageDrafts {
  constructor(private readonly core: DraftCore, private readonly replay: DraftReplay) {}

  list(context: DraftContext, query: DraftQuery) { return this.core.list(context, query); }
  get(context: DraftContext, id: string) { return this.core.get(context, id); }

  listQuizzes(context: DraftContext, page = 1, limit = 20) { return this.core.listQuizzes(context, page, limit); }
  getQuiz(context: DraftContext, id: string) { return this.core.getQuiz(context, id); }
  validate(context: DraftContext, id: string) { return this.core.validate(context, id); }

  appendQuestions(context: DraftContext, key: string, id: string, questions: DraftQuestion[]) {
    return this.replay.run(context.userId, key, fingerprint('APPEND_QUESTIONS', id, questions),
      () => this.core.appendQuestions(context, id, questions), 'draft.updated');
  }

  create(context: DraftContext, key: string, input: CreateDraft) {
    return this.replay.run(context.userId, key, fingerprint('POST', null, input),
      () => this.core.create(context, input), 'draft.created');
  }

  update(context: DraftContext, key: string, id: string, input: PatchDraft) {
    return this.replay.run(context.userId, key, fingerprint('PATCH', id, input),
      () => this.core.update(context, id, input), 'draft.updated');
  }

}
