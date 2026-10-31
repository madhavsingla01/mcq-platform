import { describe, it, expect, beforeEach } from '@jest/globals';
import { CreateChallengeUseCase } from '../src/application/use-cases/CreateChallengeUseCase.js';
import { UpdateQuizUseCase } from '../src/application/use-cases/UpdateQuizUseCase.js';
import { DeleteQuizUseCase } from '../src/application/use-cases/DeleteQuizUseCase.js';
import { GetLeaderboardUseCase } from '../src/application/use-cases/GetLeaderboardUseCase.js';
import { StartAttemptUseCase } from '../src/application/use-cases/StartAttemptUseCase.js';
import { SubmitAttemptUseCase } from '../src/application/use-cases/SubmitAttemptUseCase.js';
import {
  QuestionLimitExceededError,
  InvalidChallengeTimeError,
  ChallengeImmutabilityError,
  CancellationNotAllowedError,
} from '../src/domain/errors/DomainError.js';

describe('Application Layer - Use Cases (Pure Mock Tests without MongoDB)', () => {
  let mockQuizRepo;
  let mockAttemptRepo;
  let mockQuestionRepo;

  beforeEach(() => {
    mockQuizRepo = {
      findById: async (id) => null,
      save: async (data) => ({ _id: 'quiz_123', ...data }),
      update: async (id, data) => ({ _id: id, ...data }),
      delete: async (id) => true,
      count: async () => 0,
      find: async () => [],
    };

    mockAttemptRepo = {
      findById: async (id) => null,
      countAttempts: async () => 0,
      findCompletedByQuizId: async () => [],
      deleteMany: async () => true,
    };

    mockQuestionRepo = {
      findByQuizId: async () => [],
      saveMany: async (qs) => qs,
      deleteByQuizId: async () => true,
    };
  });

  describe('CreateChallengeUseCase', () => {
    it('successfully creates a valid challenge through repositories', async () => {
      const useCase = new CreateChallengeUseCase({
        quizRepository: mockQuizRepo,
        questionRepository: mockQuestionRepo,
      });

      const payload = {
        title: 'Speed Coding Challenge',
        durationMinutes: 15,
        deadlineAt: new Date(Date.now() + 86400000),
        questions: [{ questionText: 'What is O(1)?', options: [{ label: 'A', text: 'Constant' }] }],
      };

      const result = await useCase.execute(payload);
      expect(result).toBeDefined();
      expect(result._id).toBe('quiz_123');
      expect(result.isChallenge).toBe(true);
      expect(result.durationMinutes).toBe(15);
    });

    it('rejects challenges with more than 10 questions', async () => {
      const useCase = new CreateChallengeUseCase({
        quizRepository: mockQuizRepo,
        questionRepository: mockQuestionRepo,
      });

      const payload = {
        title: 'Too Many Questions Challenge',
        durationMinutes: 15,
        deadlineAt: new Date(Date.now() + 86400000),
        questions: Array.from({ length: 11 }, (_, i) => ({ questionText: `Q${i}` })),
      };

      await expect(useCase.execute(payload)).rejects.toThrow(QuestionLimitExceededError);
    });
  });

  describe('UpdateQuizUseCase', () => {
    it('prevents modifying challenge duration or questions once participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'user_owner',
        isChallenge: true,
        durationMinutes: 20,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      mockAttemptRepo.countAttempts = async () => 2; // 2 participants joined!

      const useCase = new UpdateQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({
          quizId: 'q_1',
          userId: 'user_owner',
          updatePayload: { durationMinutes: 40 },
        })
      ).rejects.toThrow(ChallengeImmutabilityError);
    });

    it('allows updating title and description even after participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'user_owner',
        isChallenge: true,
        title: 'Original Title',
      });

      mockAttemptRepo.countAttempts = async () => 5;

      const useCase = new UpdateQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const updated = await useCase.execute({
        quizId: 'q_1',
        userId: 'user_owner',
        updatePayload: { title: 'Updated Title' },
      });

      expect(updated.title).toBe('Updated Title');
    });
  });

  describe('DeleteQuizUseCase', () => {
    it('forbids cancellation after participants have started', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'user_owner',
        isChallenge: true,
      });

      mockAttemptRepo.countAttempts = async () => 1;

      const useCase = new DeleteQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({ quizId: 'q_1', userId: 'user_owner' })
      ).rejects.toThrow(CancellationNotAllowedError);
    });

    it('allows cancellation when 0 participants have started', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'user_owner',
        isChallenge: true,
      });

      mockAttemptRepo.countAttempts = async () => 0;

      const useCase = new DeleteQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const res = await useCase.execute({ quizId: 'q_1', userId: 'user_owner' });
      expect(res).toBe(true);
    });
  });

  describe('GetLeaderboardUseCase', () => {
    it('quarantines leaderboard and scores before finalization deadline', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        isChallenge: true,
        deadlineAt: new Date(Date.now() + 86400000), // In future!
      });

      mockAttemptRepo.countAttempts = async () => 14;

      const useCase = new GetLeaderboardUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
      });

      const result = await useCase.execute({ quizId: 'challenge_1' });
      expect(result.deadlinePassed).toBe(false);
      expect(result.participantCount).toBe(14);
      expect(result.leaderboard).toHaveLength(0);
      expect(result.message).toMatch(/quarantined/i);
    });
  });

  describe('StartAttemptUseCase', () => {
    it('prevents multiple attempts for participants in a challenge', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'creator_123',
        isChallenge: true,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      mockAttemptRepo.findPriorAttempt = async () => ({ _id: 'prior_att_1', status: 'completed' });
      mockAttemptRepo.findActiveAttempt = async () => null;

      const useCase = new StartAttemptUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({ quizId: 'ch_1', userId: 'participant_456' })
      ).rejects.toThrow('Only one attempt is permitted per participant for this challenge.');
    });

    it('marks creator attempts as practice', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'creator_123',
        isChallenge: true,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      mockAttemptRepo.findActiveAttempt = async () => null;
      mockAttemptRepo.save = async (att) => ({ _id: 'att_new', ...att });
      mockQuestionRepo.findByQuizId = async () => [
        { _id: 'q1', marks: 1 },
        { _id: 'q2', marks: 1 },
      ];

      const useCase = new StartAttemptUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const res = await useCase.execute({ quizId: 'ch_1', userId: 'creator_123' });
      expect(res.attempt.isPractice).toBe(true);
      expect(res.recovered).toBe(false);
    });
  });

  describe('SubmitAttemptUseCase', () => {
    it('scores answers correctly, locks answers, and quarantines score for unfinalized challenges', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'creator_123',
        isChallenge: true,
        deadlineAt: new Date(Date.now() + 86400000), // In future
      });

      const existingAttempt = {
        _id: 'att_123',
        quizId: 'ch_1',
        userId: 'participant_456',
        status: 'in_progress',
        answers: [
          { questionId: 'q1', selectedAnswer: null, isLocked: false },
          { questionId: 'q2', selectedAnswer: null, isLocked: false },
        ],
        totalQuestions: 2,
        totalMarks: 2,
        startedAt: new Date(Date.now() - 60000),
      };

      mockAttemptRepo.findById = async () => existingAttempt;
      mockAttemptRepo.save = async (att) => att;
      mockQuestionRepo.findByQuizId = async () => [
        { _id: 'q1', correctOptionIndex: 2, marks: 1 },
        { _id: 'q2', correctOptionIndex: 0, marks: 1 },
      ];

      const useCase = new SubmitAttemptUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const res = await useCase.execute({
        attemptId: 'att_123',
        userId: 'participant_456',
        clientAnswers: [
          { questionId: 'q1', selectedAnswer: 2 }, // Correct
          { questionId: 'q2', selectedAnswer: 1 }, // Wrong
        ],
        totalTimeMs: 45000,
      });

      // Verification of scoring and answer locking
      expect(res.attempt.status).toBe('completed');
      expect(res.attempt.score).toBe(1);
      expect(res.attempt.answers.every((a) => a.isLocked === true)).toBe(true);

      // Score is quarantined for participant until challenge deadline passes!
      expect(res.score).toBeNull();
      expect(res.deadlinePassed).toBe(false);
    });
  });
});
