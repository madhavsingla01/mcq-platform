import type { IncomingHttpHeaders } from 'node:http';
import type { DraftEventType } from '../draft-events.js';
import type { CreateDraft, DraftDetail, DraftPage, DraftQuery, DraftSummary, PatchDraft, DraftQuestion, DraftValidation, PublishedQuiz, PublishedQuizPage } from '../draft-contracts.js';

export interface DraftContext {
  readonly userId: string;
  readonly requestId: string;
  readonly headers: IncomingHttpHeaders;
  readonly scopes?: ReadonlySet<string>;
  readonly delegate?: (method: string, target: string) => string;
}

export interface DraftCore {
  list(context: DraftContext, query: DraftQuery): Promise<DraftPage>;
  get(context: DraftContext, id: string): Promise<DraftDetail>;
  create(context: DraftContext, input: CreateDraft): Promise<DraftSummary>;
  listQuizzes(context: DraftContext, page: number, limit: number): Promise<PublishedQuizPage>;
  getQuiz(context: DraftContext, id: string): Promise<PublishedQuiz>;
  appendQuestions(context: DraftContext, id: string, questions: DraftQuestion[]): Promise<DraftSummary>;
  validate(context: DraftContext, id: string): Promise<DraftValidation>;
  update(context: DraftContext, id: string, input: PatchDraft): Promise<DraftSummary>;
}

export interface DraftReplay {
  run(userId: string, key: string, fingerprint: string, write: () => Promise<DraftSummary>, event?: DraftEventType): Promise<DraftSummary>;
}
