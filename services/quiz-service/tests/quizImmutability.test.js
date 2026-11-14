import { describe, it, expect, beforeEach } from '@jest/globals';
import { UpdateQuizUseCase } from '../dist/application/use-cases/UpdateQuizUseCase.js';
import { DeleteQuizUseCase } from '../dist/application/use-cases/DeleteQuizUseCase.js';
import { RankingService } from '../dist/domain/services/RankingService.js';
import {
  ChallengeImmutabilityError,
  CancellationNotAllowedError,
} from '../dist/domain/errors/DomainError.js';

describe('Quiz Service — Immutability, Cancellation & Ranking Vertical Slices', () => {
  let mockQuizRepo;
  let mockAttemptRepo;
  let mockQuestionRepo;

  beforeEach(() => {
    mockQuizRepo = {
      findById: async (id) => null,
      save: async (data) => ({ _id: 'quiz_123', ...data }),
      update: async (id, data) => ({ _id: id, ...data }),
      delete: async (id) => true,
    };

    mockAttemptRepo = {
      findById: async (id) => null,
      countAttempts: async () => 0,
      deleteMany: async () => true,
    };

    mockQuestionRepo = {
      saveMany: async (qs) => qs,
      deleteByQuizId: async () => true,
    };
  });

  describe('UpdateQuizUseCase (Challenge Immutability & Question Replacement)', () => {
    it('strictly forbids modifying challenge duration, questions, deadline, or rules once participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'owner_user_1',
        isChallenge: true,
        durationMinutes: 15,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      mockAttemptRepo.countAttempts = async () => 3; // 3 participants joined

      const useCase = new UpdateQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({
          quizId: 'challenge_1',
          userId: 'owner_user_1',
          updatePayload: { durationMinutes: 30 },
        })
      ).rejects.toThrow(ChallengeImmutabilityError);
    });

    it('allows updating title and description on challenges even after participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'owner_user_1',
        isChallenge: true,
        title: 'Original Title',
      });

      mockAttemptRepo.countAttempts = async () => 3;

      const useCase = new UpdateQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const updated = await useCase.execute({
        quizId: 'challenge_1',
        userId: 'owner_user_1',
        updatePayload: { title: 'Updated Title' },
      });

      expect(updated.title).toBe('Updated Title');
    });

    it('rejects question replacement when attempts exist on standard quizzes', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'owner_user_1',
        isChallenge: false,
        title: 'Standard Quiz',
      });

      mockAttemptRepo.countAttempts = async () => 1;

      const useCase = new UpdateQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({
          quizId: 'quiz_1',
          userId: 'owner_user_1',
          updatePayload: {
            questions: [{ questionText: 'Replaced question?' }],
          },
        })
      ).rejects.toThrow('Questions cannot be replaced after attempts exist');
    });
  });

  describe('DeleteQuizUseCase (Cancellation Constraints)', () => {
    it('forbids deleting or cancelling a challenge after participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'owner_user_1',
        isChallenge: true,
      });

      mockAttemptRepo.countAttempts = async () => 1;

      const useCase = new DeleteQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      await expect(
        useCase.execute({ quizId: 'challenge_1', userId: 'owner_user_1' })
      ).rejects.toThrow(CancellationNotAllowedError);
    });

    it('allows deleting or cancelling when 0 participants have joined', async () => {
      mockQuizRepo.findById = async (id) => ({
        _id: id,
        uploader: 'owner_user_1',
        isChallenge: true,
      });

      mockAttemptRepo.countAttempts = async () => 0;

      const useCase = new DeleteQuizUseCase({
        quizRepository: mockQuizRepo,
        attemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
      });

      const result = await useCase.execute({ quizId: 'challenge_1', userId: 'owner_user_1' });
      expect(result).toBe(true);
    });
  });

  describe('RankingService (Standard Competition Ranking 1, 1, 3)', () => {
    it('calculates competition ranking with tied ranks skipping subsequent rank (1, 1, 3)', () => {
      const attempts = [
        { userId: { _id: 'u1', name: 'Alice' }, score: 10, totalTimeMs: 50000 },
        { userId: { _id: 'u2', name: 'Bob' }, score: 10, totalTimeMs: 50000 },
        { userId: { _id: 'u3', name: 'Charlie' }, score: 8, totalTimeMs: 40000 },
      ];

      const ranked = RankingService.calculateRankings(attempts, 'competition');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(1);
      expect(ranked[2].rank).toBe(3); // Rank 2 is skipped in competition ranking (1, 1, 3)
    });

    it('filters out creator practice attempts from official ranking', () => {
      const attempts = [
        { userId: { _id: 'creator' }, score: 10, totalTimeMs: 30000, isPractice: true },
        { userId: { _id: 'u1', name: 'Alice' }, score: 9, totalTimeMs: 40000, isPractice: false },
      ];

      const ranked = RankingService.calculateRankings(attempts, 'competition');
      expect(ranked.length).toBe(1);
      expect(ranked[0].user.name).toBe('Alice');
      expect(ranked[0].rank).toBe(1);
    });
  });
});
