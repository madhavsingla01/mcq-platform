import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubmitAttemptUseCase } from '../../services/attempt-service/src/application/use-cases/SubmitAttemptUseCase.js';
import { StartAttemptUseCase } from '../../services/attempt-service/src/application/use-cases/StartAttemptUseCase.js';

test('attempt invariant: completed attempt immutability prevents re-submission or score tampering', async () => {
  const attemptId = 'att-completed-123';
  const userId = 'usr-456';
  const quizId = 'quiz-789';

  // Completed attempt record
  const existingCompletedAttempt = {
    _id: attemptId,
    userId,
    quizId,
    status: 'completed',
    completed: true,
    score: 85,
    totalQuestions: 10,
    percentage: 85,
    answers: [{ questionId: 'q1', selectedAnswer: 0, isCorrect: true, marksAwarded: 1, isLocked: true }],
  };

  const mockAttemptRepo = {
    findById: async (id) => (id === attemptId ? { ...existingCompletedAttempt } : null),
    save: async (att) => att,
  };
  const mockQuizRepo = {
    findById: async () => ({ _id: quizId, isChallenge: false }),
  };
  const mockQuestionRepo = {
    findByQuizId: async () => [
      { _id: 'q1', correctOptionIndex: 0, marks: 1 },
    ],
  };

  const useCase = new SubmitAttemptUseCase({
    attemptRepository: mockAttemptRepo,
    quizRepository: mockQuizRepo,
    questionRepository: mockQuestionRepo,
  });

  // Attempting to submit new answers or higher score to an already completed attempt
  const result = await useCase.execute({
    attemptId,
    userId,
    clientAnswers: [{ questionId: 'q1', selectedAnswer: 3, score: 100 }], // malicious client payload
  });

  // Must return the immutable existing score, NOT recalculated from new payload
  assert.equal(result.attempt.status, 'completed');
  assert.equal(result.score, 85, 'Score must remain immutable');
  assert.equal(result.attempt.answers[0].selectedAnswer, 0, 'Original answers must remain locked');
});

test('attempt invariant: server-side score calculation strictly validates against canonical answer keys', async () => {
  const attemptId = 'att-active-123';
  const userId = 'usr-456';
  const quizId = 'quiz-789';

  const inProgressAttempt = {
    _id: attemptId,
    userId,
    quizId,
    status: 'in_progress',
    completed: false,
    startedAt: new Date(Date.now() - 60000),
    totalMarks: 3,
    answers: [
      { questionId: 'q1', selectedAnswer: null, isLocked: false },
      { questionId: 'q2', selectedAnswer: null, isLocked: false },
      { questionId: 'q3', selectedAnswer: null, isLocked: false },
    ],
  };

  const mockAttemptRepo = {
    findById: async (id) => (id === attemptId ? inProgressAttempt : null),
    save: async (att) => att,
  };
  const mockQuizRepo = {
    findById: async () => ({ _id: quizId, isChallenge: false }),
  };
  // Canonical questions stored on server
  const mockQuestionRepo = {
    findByQuizId: async () => [
      { _id: 'q1', correctOptionIndex: 2, marks: 1 }, // Correct is 2
      { _id: 'q2', correctOptionIndex: 0, marks: 1 }, // Correct is 0
      { _id: 'q3', correctOptionIndex: 1, marks: 1 }, // Correct is 1
    ],
  };

  const useCase = new SubmitAttemptUseCase({
    attemptRepository: mockAttemptRepo,
    quizRepository: mockQuizRepo,
    questionRepository: mockQuestionRepo,
  });

  // Client submits:
  // q1: answered 2 (Correct)
  // q2: answered 3 (Wrong)
  // q3: answered 1 (Correct)
  // Plus client attempts to inject fake `score: 9999` and `isCorrect: true` on all items
  const result = await useCase.execute({
    attemptId,
    userId,
    score: 9999, // Injected fake score
    clientAnswers: [
      { questionId: 'q1', selectedAnswer: 2, isCorrect: true, marks: 100 },
      { questionId: 'q2', selectedAnswer: 3, isCorrect: true, marks: 100 }, // False claim of correctness
      { questionId: 'q3', selectedAnswer: 1, isCorrect: true, marks: 100 },
    ],
  });

  // Server must compute exactly 2 out of 3 marks based on canonical questions
  assert.equal(result.score, 2, 'Calculated score must strictly reflect server-side answers (2 correct)');
  assert.equal(inProgressAttempt.score, 2);
  assert.equal(inProgressAttempt.correctCount, 2);
  assert.equal(inProgressAttempt.answers[0].isCorrect, true);
  assert.equal(inProgressAttempt.answers[1].isCorrect, false, 'Server rejected false claim on q2');
  assert.equal(inProgressAttempt.answers[2].isCorrect, true);
});

test('attempt invariant: active attempt uniqueness prevents duplicate concurrent attempts', async () => {
  const quizId = 'quiz-unique-test';
  const userId = 'usr-unique-user';

  const existingAttempt = {
    _id: 'att-existing-1',
    quizId,
    userId,
    status: 'in_progress',
    completed: false,
    startedAt: new Date(Date.now() - 30000),
  };

  let createdAttempts = [];
  const mockAttemptRepo = {
    findActiveAttempt: async ({ quizId: qId, userId: uId }) => {
      if (qId === quizId && uId === userId) return existingAttempt;
      return null;
    },
    findPriorAttempt: async () => null,
    create: async (data) => {
      createdAttempts.push(data);
      return data;
    },
  };
  const mockQuizRepo = {
    findById: async () => ({ _id: quizId, isChallenge: false }),
  };
  const mockQuestionRepo = {
    findByQuizId: async () => [{ _id: 'q1' }],
  };

  const useCase = new StartAttemptUseCase({
    attemptRepository: mockAttemptRepo,
    quizRepository: mockQuizRepo,
    questionRepository: mockQuestionRepo,
  });

  // When user attempts to start a new attempt while an active one exists
  const result = await useCase.execute({
    quizId,
    userId,
    forceNew: false,
  });

  // Must resume the existing active attempt instead of creating a second active attempt
  assert.equal(result.recovered, true);
  assert.equal(result.attempt._id, 'att-existing-1');
  assert.equal(createdAttempts.length, 0, 'No new attempt record may be created while one is in progress');
});
