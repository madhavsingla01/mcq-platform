import { z } from 'zod';
import { draftDetail, draftId, draftSummary, pagination, readQuestion, publishedQuiz, publishedQuizPage } from '../../application/draft-contracts.js';
import type { CreateDraft, DraftDetail, DraftPage, DraftQuery, DraftSummary, PatchDraft, DraftQuestion, DraftValidation } from '../../application/draft-contracts.js';
import type { DraftContext, DraftCore } from '../../application/ports/draft-core.js';
import { AppError, InternalApiError } from '../../shared/errors/app-error.js';
import { InternalApiClient } from './internal-api-client.js';
import { mappedResponse } from '../../application/authoring-import.js';

const rawDraft = z.object({
  _id: draftId,
  title: z.string(),
  description: z.string().nullish(), category: z.string().nullish(),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']).nullish(),
  tags: z.array(z.string()).nullish(), isChallenge: z.boolean().optional(),
  questionCount: z.int().nonnegative().optional(), updatedAt: z.iso.datetime(),
  deadlineAt: z.iso.datetime().nullish(), durationMinutes: z.number().nonnegative().nullish(),
  questions: z.array(z.unknown()).optional(),
});
const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
const coreList = envelope(z.object({ drafts: z.array(rawDraft), pagination }));
const coreDetail = envelope(z.object({ draft: rawDraft }));
const quizCreated = envelope(z.object({ quizId: draftId, quiz: rawDraft }));
const challengeWritten = envelope(z.object({ challengeId: draftId, challenge: rawDraft }));
const rawPublishedQuiz = rawDraft.extend({
  visibility: z.enum(['public', 'private', 'unlisted']).nullish(),
});
const corePublishedQuiz = envelope(z.object({ quiz: rawPublishedQuiz }));
const corePublishedQuizzes = envelope(z.object({ quizzes: z.array(rawPublishedQuiz), pagination }));
const coreValidation = envelope(z.object({ valid: z.literal(true) }));

function summarizePublished(raw: z.infer<typeof rawPublishedQuiz>) {
  const { id, title, description, category, difficulty, tags, questionCount, updatedAt } = summarize(raw);
  return publishedQuiz.parse({
    id, title, description, category, difficulty, tags, questionCount, updatedAt,
    visibility: raw.visibility ?? 'private', status: 'published',
  });
}

const coreQuestion = z.object({
  questionText: z.string().optional(), question: z.string().optional(),
  questionType: z.string().optional(), type: z.string().optional(),
  correctAnswer: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  correctOption: z.int().nonnegative().optional(),
  options: z.array(z.union([z.string(), z.object({
    label: z.string().optional(), text: z.string().optional(), optionText: z.string().optional(),
    optionId: z.string().optional(), isCorrect: z.boolean().optional(), accessibilityMedia: z.array(z.unknown()).optional(),
  })])).optional(),
  explanation: z.string().optional(), marks: z.number().optional(), negativeMarks: z.number().optional(),
  accessibilityMedia: z.array(z.unknown()).optional(),
});

function summarize(raw: z.infer<typeof rawDraft>, kind = raw.isChallenge ? 'challenge' : 'quiz') {
  return draftSummary.parse({
    id: raw._id, kind,
    title: raw.title, description: raw.description ?? '', category: raw.category ?? 'General',
    difficulty: raw.difficulty ?? 'All Levels', tags: raw.tags ?? [],
    questionCount: raw.questions?.length ?? raw.questionCount ?? 0,
    visibility: 'private', status: 'draft',
    durationMinutes: raw.durationMinutes ?? null, deadlineAt: raw.deadlineAt ?? null, updatedAt: raw.updatedAt,
  });
}

function adaptQuestion(input: unknown) {
  const question = coreQuestion.parse(input);
  const options = (question.options || []).map((option, index) => {
    const label = String.fromCharCode(65 + index);
    return typeof option === 'string'
      ? { label, text: option, isCorrect: question.correctOption === index }
      : { ...option, label: option.label || label, text: option.text ?? option.optionText ?? '' };
  });
  return readQuestion.parse({
    ...question, questionText: question.questionText ?? question.question ?? '',
    questionType: question.questionType ?? question.type ?? 'multiple_choice',
    options, correctAnswer: question.correctAnswer ?? options.find((_, index) => index === question.correctOption)?.label,
  });
}

function challengeInput(fields: PatchDraft): PatchDraft {
  if (!fields.questions) return fields;
  return {
    ...fields,
    questions: fields.questions.map(question => {
      const expected = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
      return {
        ...question,
        options: (question.options ?? []).map((option, index) => {
          const label = option.label ?? String.fromCharCode(65 + index);
          return { ...option, label, isCorrect: option.isCorrect ?? expected.includes(label) };
        }),
      };
    }),
  };
}

const domainErrors: Record<number, readonly [string, string]> = {
  400: ['DRAFT_INVALID', 'Quiz Core rejected the draft fields'],
  401: ['UNAUTHENTICATED', 'Authentication required'],
  403: ['FORBIDDEN', 'Access denied'],
  404: ['DRAFT_NOT_FOUND', 'Draft not found'],
  409: ['DRAFT_CONFLICT', 'The draft changed. Reload it and try again'],
  413: ['PAYLOAD_TOO_LARGE', 'Draft request is too large'],
  429: ['RATE_LIMITED', 'Draft request limit reached'],
};

export class DraftCoreClient implements DraftCore {
  constructor(private readonly http: InternalApiClient, private readonly quizOrigin: string, private readonly challengeOrigin: string) {}

  async read(context: DraftContext, uploadId: string) {
    const { data } = await this.send(context, mappedResponse, '/api/v1/quiz/imports/' + uploadId + '/questions');
    return data.questions;
  }

  private async send<T extends z.ZodType>(
    context: DraftContext, schema: T, path: string, method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: object, origin = this.quizOrigin,
  ): Promise<z.output<T>> {
    try {
      const delegation = context.delegate?.(method, path);
      const headers = delegation ? {} : context.headers;
      return schema.parse(await this.http.requestJson(origin, path, context.requestId, headers, method, body, delegation));
    } catch (error) {
      if (error instanceof InternalApiError) {
        const domain = domainErrors[error.statusCode];
        if (domain) throw new AppError(error.statusCode === 400 ? error.message : domain[1], error.statusCode, domain[0]);
        if (error.statusCode === 503) throw new AppError('Draft service is temporarily unavailable', 503, error.code);
      }
      if (error instanceof z.ZodError || error instanceof InternalApiError) {
        throw new AppError('Draft service returned an invalid response', 502, 'INVALID_DEPENDENCY_RESPONSE');
      }
      throw error;
    }
  }

  async list(context: DraftContext, query: DraftQuery): Promise<DraftPage> {
    const search = new URLSearchParams({ scope: 'integration', page: String(query.page ?? 1), limit: String(query.limit ?? 20) });
    if (query.kind) search.set('kind', query.kind);
    if (query.search) search.set('search', query.search);
    const response = await this.send(context, coreList, '/api/v1/quiz/drafts?' + search.toString());
    return { drafts: response.data.drafts.map(draft => summarize(draft)), pagination: response.data.pagination };
  }

  async get(context: DraftContext, id: string): Promise<DraftDetail> {
    const response = await this.send(context, coreDetail, '/api/v1/quiz/drafts/' + id + '?scope=integration');
    const draft = response.data.draft;
    try {
      return draftDetail.parse({ ...summarize(draft), questions: (draft.questions ?? []).map(adaptQuestion) });
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      throw new AppError('Draft service returned an invalid question', 502, 'INVALID_DEPENDENCY_RESPONSE');
    }
  }

  async create(context: DraftContext, input: CreateDraft): Promise<DraftSummary> {
    const { kind, ...fields } = input;
    const payload = { ...fields, questions: fields.questions ?? [], isDraft: true, visibility: 'private' };
    if (kind === 'quiz') {
      const response = await this.send(context, quizCreated, '/api/v1/quiz/manual', 'POST', payload);
      return summarize(response.data.quiz);
    }
    const response = await this.send(context, challengeWritten, '/api/v1/challenges?scope=integration', 'POST', {
      ...payload, ...challengeInput(fields),
    }, this.challengeOrigin);
    return summarize(response.data.challenge, 'challenge');
  }

  async listQuizzes(context: DraftContext, page: number, limit: number) {
    const query = new URLSearchParams({ scope: 'integration', page: String(page), limit: String(limit) });
    const { data } = await this.send(context, corePublishedQuizzes, '/api/v1/quiz/my?' + query.toString());
    return publishedQuizPage.parse({ quizzes: data.quizzes.map(summarizePublished), pagination: data.pagination });
  }

  async getQuiz(context: DraftContext, id: string) {
    try {
      const { data } = await this.send(context, corePublishedQuiz, '/api/v1/quiz/my/' + id);
      return summarizePublished(data.quiz);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
      }
      throw error;
    }
  }

  async appendQuestions(context: DraftContext, id: string, questions: DraftQuestion[]) {
    const current = await this.summary(context, id);
    if (current.kind === 'challenge') {
      const adapted = challengeInput({ questions });
      const { data } = await this.send(context, challengeWritten, '/api/v1/challenges?scope=integration', 'POST', {
        draftId: id, isDraft: true, appendQuestions: adapted.questions,
      }, this.challengeOrigin);
      return summarize(data.challenge, 'challenge');
    }
    const { data } = await this.send(context, coreDetail, '/api/v1/quiz/drafts/' + id + '/questions', 'POST', { questions });
    return summarize(data.draft);
  }

  async validate(context: DraftContext, id: string): Promise<DraftValidation> {
    const current = await this.summary(context, id);
    const isChallenge = current.kind === 'challenge';
    const pathname = (isChallenge ? '/api/v1/challenges/drafts/' : '/api/v1/quiz/drafts/') + id + '/validate';
    try {
      const { data } = await this.send(context, coreValidation, pathname, 'POST', {}, isChallenge ? this.challengeOrigin : this.quizOrigin);
      return data;
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 400) return { valid: false, issues: [error.message] };
      throw error;
    }
  }

  private async summary(context: DraftContext, id: string) {
    const response = await this.send(context, coreDetail, '/api/v1/quiz/drafts/' + id + '?scope=integration&summary=true');
    return summarize(response.data.draft);
  }

  async update(context: DraftContext, id: string, input: PatchDraft): Promise<DraftSummary> {
    const current = await this.summary(context, id);
    if (current.kind === 'quiz') {
      if (input.durationMinutes !== undefined || input.deadlineAt !== undefined) {
        throw new AppError('Duration and deadline are challenge fields', 400, 'DRAFT_INVALID');
      }
      const response = await this.send(context, coreDetail, '/api/v1/quiz/drafts/' + id + '?scope=integration', 'PUT', input);
      return summarize(response.data.draft);
    }
    if (input.questions && input.questions.length > 10) {
      throw new AppError('Challenges support at most 10 questions', 400, 'DRAFT_INVALID');
    }
    const response = await this.send(context, challengeWritten, '/api/v1/challenges?scope=integration', 'POST', {
      ...challengeInput(input), draftId: id, isDraft: true, visibility: 'private',
    }, this.challengeOrigin);
    return summarize(response.data.challenge, 'challenge');
  }
}
