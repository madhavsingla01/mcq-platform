import { questionsForAttempt } from '../services/questionSnapshot.service.js';
import Quiz from '../models/Quiz.model.js';
import Attempt from '../models/Attempt.model.js';
import { mergeAttemptTrackingPayload } from '../services/quiz/attemptTracking.service.js';

// Sole scheduled attempt finalizer. Quiz Service only retains file cleanup.
export const finalizeExpiredAttempts = async (at = new Date()) => {
  try {
    const now = at;

    // 1. Auto-finalize active challenges that passed their deadline
    const expiredChallenges = await Quiz.find({
      isChallenge: true,
      deadlineAt: { $lte: now },
      challengeStatus: { $in: ['active', 'ended'] },
    });

    for (const challenge of expiredChallenges) {
      if (challenge.challengeStatus !== 'ended') {
        challenge.challengeStatus = 'ended';
        await challenge.save();
      }

      const inProgressAttempts = await Attempt.find({
        quizId: challenge._id,
        status: 'in_progress',
      });

      for (const attempt of inProgressAttempts) {
        mergeAttemptTrackingPayload({
          attempt,
          questions: await questionsForAttempt(attempt.quizId, attempt),
          payload: {},
          finalizing: true,
        });
        await attempt.save();
      }
    }

    // 2. Auto-finalize any in-progress strict attempts whose deadline has passed
    const expiredAttempts = await Attempt.find({
      status: 'in_progress',
      timerMode: 'strict',
      deadlineAt: { $lte: now },
    });

    for (const attempt of expiredAttempts) {
      mergeAttemptTrackingPayload({
        attempt,
        questions: await questionsForAttempt(attempt.quizId, attempt),
        payload: {},
        finalizing: true,
      });
      await attempt.save();
    }
  } catch (err) {
    throw err;
  }
};

export function startFinalizationWorker(onError = console.error) {
  let pending = null;
  const run = () => {
    if (pending) return pending;
    pending = finalizeExpiredAttempts().catch(() => onError('Attempt finalization failed')).finally(() => { pending = null; });
    return pending;
  };
  const timer = setInterval(run, 60000);
  timer.unref();
  run();
  return async () => { clearInterval(timer); await pending; };
}
