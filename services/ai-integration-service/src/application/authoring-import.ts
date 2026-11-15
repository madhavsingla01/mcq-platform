import { z } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
import { createDraft, draftId, draftQuestion, type CreateDraft, type DraftQuestion } from './draft-contracts.js';
import type { DraftContext, DraftReplay, DraftCore } from './ports/draft-core.js';
import { fingerprint } from './use-cases/manage-drafts.js';

export const jsonImport = z.strictObject({ format: z.literal('quizfocus.quiz.v1'), draft: createDraft });
export const uploadImport = z.strictObject({
  format: z.literal('mapped-upload'), uploadId: draftId, title: z.string().trim().min(3).max(70),
});
export const importRequest = z.discriminatedUnion('format', [jsonImport, uploadImport]);
export const generationRequest = z.strictObject({
  title: z.string().trim().min(3).max(70), topic: z.string().trim().min(3).max(2000),
  count: z.number().int().min(1).max(10),
});
type GenerationRequest = z.infer<typeof generationRequest>;
type ImportRequest = z.infer<typeof importRequest>;

const generatedChoice = z.string().trim().min(1).max(500);
export const generationResponse = z.strictObject({ questions: z.array(z.strictObject({
  prompt: z.string().trim().min(1).max(2000),
  choices: z.array(generatedChoice).min(2).max(6),
  correctIndex: z.number().int().nonnegative(),
  explanation: z.string().trim().max(2000).optional(),
})).min(1).max(10) });

export interface QuizGenerator {
  generate(request: GenerationRequest): Promise<unknown>;
}
export interface GenerationUsage {
  claim(account: string): Promise<void>;
}
export interface MappedQuestionReader {
  read(context: DraftContext, id: string): Promise<DraftQuestion[]>;
}

const canonical = (text: string) => text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
function verifyQuestions(questions: DraftQuestion[] | undefined) {
  if (!questions?.length) throw new AppError('Provide at least one question to import', 422, 'INVALID_QUESTIONS');
  const seen = new Set<string>();
  for (const [index, question] of questions.entries()) {
    const prompt = canonical(question.questionText);
    if (prompt && seen.has(prompt)) throw new AppError(`Question ${index + 1} duplicates an earlier question`, 422, 'DUPLICATE_QUESTION');
    if (prompt) seen.add(prompt);
    if (question.questionType === 'short_answer') {
      if (typeof question.correctAnswer !== 'string' || !question.correctAnswer.trim()) {
        throw new AppError(`Question ${index + 1} needs an expected answer`, 422, 'INVALID_QUESTIONS');
      }
      continue;
    }
    const options = question.options ?? [];
    const labels = options.map((option, i) => option.label ?? String.fromCharCode(65 + i));
    const marked = labels.filter((_, i) => options[i]?.isCorrect);
    const answer = question.correctAnswer;
    const answers = typeof answer === 'string' ? [answer] : answer ?? marked;
    const textChoices = options.map(option => canonical(option.text)).filter(Boolean);
    if (new Set(textChoices).size !== textChoices.length || !answers.length ||
        (question.questionType !== 'checkboxes' && answers.length !== 1) ||
        new Set(answers).size !== answers.length || answers.some(value => !labels.includes(value)) ||
        (marked.length > 0 && (marked.length !== answers.length || marked.some(value => !answers.includes(value))))) {
      throw new AppError(`Question ${index + 1} needs distinct choices and a matching answer key`, 422, 'INVALID_QUESTIONS');
    }
  }
}

export const mappedResponse = z.object({ success: z.literal(true), data: z.object({ questions: z.array(draftQuestion).max(100) }) });

export class ImportDrafts {
  constructor(private readonly core: DraftCore, private readonly replay: DraftReplay, private readonly reader: MappedQuestionReader,
    private readonly generation?: { provider: QuizGenerator; usage: GenerationUsage }) {}

  import(context: DraftContext, key: string, input: ImportRequest) {
    return this.replay.run(context.userId, key, fingerprint('IMPORT_DRAFT', null, input), async () => {
      const draft: CreateDraft = input.format === 'quizfocus.quiz.v1'
        ? input.draft : { kind: 'quiz', title: input.title, questions: await this.reader.read(context, input.uploadId) };
      verifyQuestions(draft.questions);
      return this.core.create(context, draft);
    }, 'import.completed');
  }

  generate(context: DraftContext, key: string, input: GenerationRequest) {
    const generation = this.generation;
    if (!generation) throw new AppError('Quiz generation provider is not configured', 503, 'GENERATION_UNAVAILABLE');
    return this.replay.run(context.userId, key, fingerprint('GENERATE_DRAFT', null, input), async () => {
      await generation.usage.claim(context.userId);
      const result = generationResponse.safeParse(await generation.provider.generate(input));
      if (!result.success || result.data.questions.length !== input.count) {
        throw new AppError('Provider returned invalid quiz output', 422, 'INVALID_GENERATION_OUTPUT');
      }
      const questions = result.data.questions.map(entry => {
        if (entry.correctIndex >= entry.choices.length) {
          throw new AppError('Provider returned an invalid correct choice', 422, 'INVALID_GENERATION_OUTPUT');
        }
        return draftQuestion.parse({
          questionType: 'multiple_choice', questionText: entry.prompt,
          options: entry.choices.map((text, index) => ({ text, isCorrect: index === entry.correctIndex })),
          correctAnswer: String.fromCharCode(65 + entry.correctIndex), explanation: entry.explanation,
        });
      });
      verifyQuestions(questions);
      return this.core.create(context, { kind: 'quiz', title: input.title, questions });
    }, 'draft.created');
  }
}
