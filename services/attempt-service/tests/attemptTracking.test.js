import { buildAttemptAnalytics } from '../dist/services/quiz/attemptTracking.service.js';

describe('Attempt Tracking Service - Scoring and Analytics', () => {
  it('should correctly build attempt analytics', () => {
    const attempt = {
      totalTimeMs: 45000,
      answers: [
        {
          questionId: 'q1',
          selectedAnswer: 'A',
          isCorrect: true,
          timeTakenMs: 15000,
        },
        {
          questionId: 'q2',
          selectedAnswer: 'B',
          isCorrect: false,
          timeTakenMs: 30000,
        },
        {
          questionId: 'q3',
          selectedAnswer: null,
          isCorrect: false,
          timeTakenMs: 0,
        }
      ]
    };

    const questions = [
      { _id: 'q1', questionNumber: 1, correctAnswer: 'A' },
      { _id: 'q2', questionNumber: 2, correctAnswer: 'C' },
      { _id: 'q3', questionNumber: 3, correctAnswer: 'D' }
    ];

    const analytics = buildAttemptAnalytics({ attempt, questions });

    expect(analytics.answeredCount).toBe(2);
    expect(analytics.correctCount).toBe(1);
    expect(analytics.wrongCount).toBe(1);
    expect(analytics.skippedCount).toBe(1);
    expect(analytics.averageTimePerQuestionMs).toBe(15000); // 45000 / 3
    expect(analytics.timeSpentCorrectMs).toBe(15000);
    expect(analytics.timeSpentWrongMs).toBe(30000);
  });
});
