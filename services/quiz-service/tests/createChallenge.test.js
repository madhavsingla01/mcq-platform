import { describe, it, expect, beforeEach } from '@jest/globals';
import { CreateChallengeUseCase } from '../src/application/use-cases/CreateChallengeUseCase.js';
import { Challenge } from '../src/domain/entities/Challenge.js';
import {
  QuestionLimitExceededError,
  InvalidChallengeTimeError,
} from '../src/domain/errors/DomainError.js';

describe('Quiz Service — CreateChallenge Vertical Slice', () => {
  let mockQuizRepo;
  let mockQuestionRepo;
  let useCase;

  beforeEach(() => {
    mockQuizRepo = {
      save: async (data) => ({
        _id: 'quiz_created_123',
        ...data,
      }),
      findById: async () => null,
      count: async () => 0,
    };

    mockQuestionRepo = {
      saveMany: async (qs) => qs.map((q, idx) => ({ _id: `q_${idx}`, ...q })),
      findByQuizId: async () => [],
    };

    useCase = new CreateChallengeUseCase({
      quizRepository: mockQuizRepo,
      questionRepository: mockQuestionRepo,
    });
  });

  describe('Domain Entity Business Invariants', () => {
    it('enforces maximum 10 questions invariant (fails if > 10)', () => {
      const elevenQuestions = Array.from({ length: 11 }, (_, i) => ({
        questionText: `Question ${i + 1}`,
      }));

      const challenge = new Challenge({
        title: 'Too Many Questions',
        durationMinutes: 15,
        deadlineAt: new Date(Date.now() + 86400000),
        questions: elevenQuestions,
      });

      expect(() => challenge.validate()).toThrow(QuestionLimitExceededError);
    });

    it('enforces required positive duration in minutes', () => {
      const challengeZeroDuration = new Challenge({
        title: 'Zero Duration Challenge',
        durationMinutes: 0,
        deadlineAt: new Date(Date.now() + 86400000),
        questions: [{ questionText: 'Q1' }],
      });

      expect(() => challengeZeroDuration.validate()).toThrow(InvalidChallengeTimeError);
    });

    it('enforces future finalization deadline (rejects past or missing deadline)', () => {
      const pastDeadline = new Date(Date.now() - 3600000); // 1 hour in the past
      const challengePastDeadline = new Challenge({
        title: 'Past Deadline Challenge',
        durationMinutes: 20,
        deadlineAt: pastDeadline,
        questions: [{ questionText: 'Q1' }],
      });

      expect(() => challengePastDeadline.validate()).toThrow(InvalidChallengeTimeError);
    });
  });

  describe('CreateChallengeUseCase Orchestration', () => {
    it('successfully validates, saves quiz header, and saves questions through repositories', async () => {
      const futureDeadline = new Date(Date.now() + 86400000 * 2);
      const payload = {
        title: 'Node.js Microservices Challenge',
        description: 'Test your distributed systems knowledge',
        uploaderId: 'user_dev_001',
        durationMinutes: 25,
        deadlineAt: futureDeadline,
        accessType: 'public',
        questions: [
          {
            questionText: 'What is the primary role of an API Gateway?',
            options: [
              { label: 'A', text: 'Reverse Proxy and Routing', isCorrect: true },
              { label: 'B', text: 'Database Storage', isCorrect: false },
            ],
          },
          {
            questionText: 'What is an idempotent operation?',
            options: [
              { label: 'A', text: 'Same result regardless of repetitions', isCorrect: true },
              { label: 'B', text: 'Runs only once', isCorrect: false },
            ],
          },
        ],
      };

      const result = await useCase.execute(payload);

      expect(result).toBeDefined();
      expect(result._id).toBe('quiz_created_123');
      expect(result.isChallenge).toBe(true);
      expect(result.durationMinutes).toBe(25);
      expect(result.questionCount).toBe(2);
      expect(result.settings.timerMode).toBe('strict');
      expect(result.isPublic).toBe(true);
    });

    it('rejects execution when question limit is exceeded through use case', async () => {
      const payload = {
        title: 'Excessive Challenge',
        durationMinutes: 10,
        deadlineAt: new Date(Date.now() + 86400000),
        questions: Array.from({ length: 12 }, (_, i) => ({ questionText: `Question ${i + 1}` })),
      };

      await expect(useCase.execute(payload)).rejects.toThrow(QuestionLimitExceededError);
    });
  });
});
