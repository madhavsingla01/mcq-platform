import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const insertMany = jest.fn();
const deleteMany = jest.fn();
const deleteOne = jest.fn();
const loggerError = jest.fn();

jest.unstable_mockModule('../dist/models/Question.model.js', () => ({
  default: { insertMany, deleteMany },
}));
jest.unstable_mockModule('../dist/models/Quiz.model.js', () => ({
  default: { deleteOne },
}));
jest.unstable_mockModule('../dist/utils/logger.js', () => ({
  logger: { error: loggerError },
}));

const { persistGeneratedQuestions } = await import('../dist/services/quiz/persistGeneratedQuestions.js');

describe('persist generated quiz questions', () => {
  const quiz = { _id: 'quiz-1' };
  const questions = [{ questionText: 'Question 1' }];

  beforeEach(() => {
    insertMany.mockReset();
    deleteMany.mockReset();
    deleteOne.mockReset();
    loggerError.mockReset();
  });

  it('associates questions with the newly created quiz', async () => {
    insertMany.mockResolvedValue(questions);

    await expect(persistGeneratedQuestions(quiz, questions)).resolves.toBe(questions);
    expect(insertMany).toHaveBeenCalledWith([{ questionText: 'Question 1', quizId: quiz._id }]);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('removes partial questions and the new quiz when insertion fails', async () => {
    const insertError = new Error('bulk insert failed');
    insertMany.mockRejectedValue(insertError);
    deleteMany.mockResolvedValue({ deletedCount: 1 });
    deleteOne.mockResolvedValue({ deletedCount: 1 });

    await expect(persistGeneratedQuestions(quiz, questions)).rejects.toBe(insertError);
    expect(deleteMany).toHaveBeenCalledWith({ quizId: quiz._id });
    expect(deleteOne).toHaveBeenCalledWith({ _id: quiz._id });
  });

  it('surfaces rollback failures with both causes', async () => {
    const insertError = new Error('bulk insert failed');
    const cleanupError = new Error('rollback failed');
    insertMany.mockRejectedValue(insertError);
    deleteMany.mockRejectedValue(cleanupError);

    await expect(persistGeneratedQuestions(quiz, questions)).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [insertError, cleanupError],
    });
    expect(loggerError).toHaveBeenCalled();
    expect(deleteOne).toHaveBeenCalledWith({ _id: quiz._id });
  });
});
