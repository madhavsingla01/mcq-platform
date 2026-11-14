import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const findOne = jest.fn();

jest.unstable_mockModule('../dist/models/Quiz.model.js', () => ({
  default: { findOne },
}));
jest.unstable_mockModule('../dist/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

const { findDuplicateQuiz, withGenerationLock } = await import('../dist/services/upload/fileHash.service.js');

const queryFor = (value) => {
  const query = {
    sort: jest.fn(() => query),
    select: jest.fn(() => Promise.resolve(value)),
  };
  return query;
};

describe('quiz duplicate privacy and generation scope', () => {
  beforeEach(() => {
    findOne.mockReset();
  });

  it('does not perform a quiz lookup when the uploader is unknown', async () => {
    expect(await findDuplicateQuiz({ fileHash: 'same-file' })).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('limits duplicate lookups to the requesting uploader', async () => {
    const quiz = { _id: 'quiz-owner', title: 'Private quiz' };
    findOne.mockReturnValue(queryFor(quiz));

    await expect(findDuplicateQuiz({ fileHash: 'same-file', uploaderId: 'owner-1' })).resolves.toBe(quiz);
    expect(findOne).toHaveBeenCalledWith({ fileHash: 'same-file', uploader: 'owner-1' });
  });

  it('does not coalesce guest generations without an owner scope', async () => {
    let release;
    let markBothStarted;
    let startedCount = 0;
    const bothStarted = new Promise((resolve) => { markBothStarted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const generate = () => withGenerationLock('same-file', async () => {
      startedCount += 1;
      if (startedCount === 2) markBothStarted();
      await gate;
      return { quiz: { _id: `guest-${startedCount}` }, questionCount: 1 };
    });

    const first = generate();
    const second = generate();
    await bothStarted;
    release();
    await Promise.all([first, second]);

    expect(startedCount).toBe(2);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('coalesces requests for one owner without sharing results across owners', async () => {
    findOne.mockImplementation(() => queryFor(null));

    let releaseFirst;
    let markFirstStarted;
    const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const firstQuiz = { _id: 'owner-one-quiz', questionCount: 1 };
    const firstGeneration = withGenerationLock('same-file', async () => {
      markFirstStarted();
      await firstGate;
      return { quiz: firstQuiz, questionCount: 1, errors: [] };
    }, { uploaderId: 'owner-1' });

    await firstStarted;
    const sameOwnerGeneration = withGenerationLock(
      'same-file',
      jest.fn(async () => ({ quiz: { _id: 'unexpected' }, questionCount: 1 })),
      { uploaderId: 'owner-1' }
    );
    const otherOwnerQuiz = { _id: 'owner-two-quiz', questionCount: 1 };
    const otherOwnerGeneration = withGenerationLock(
      'same-file',
      jest.fn(async () => ({ quiz: otherOwnerQuiz, questionCount: 1, errors: [] })),
      { uploaderId: 'owner-2' }
    );

    releaseFirst();
    const [first, sameOwner, otherOwner] = await Promise.all([
      firstGeneration,
      sameOwnerGeneration,
      otherOwnerGeneration,
    ]);

    expect(first.quiz).toBe(firstQuiz);
    expect(sameOwner.quiz).toBe(firstQuiz);
    expect(sameOwner.isDuplicate).toBe(true);
    expect(otherOwner.quiz).toBe(otherOwnerQuiz);
    expect(otherOwner.isDuplicate).toBe(false);
  });
});
