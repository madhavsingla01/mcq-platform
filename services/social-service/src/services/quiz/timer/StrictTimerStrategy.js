import { BaseTimerStrategy } from './BaseTimerStrategy.js';

export class StrictTimerStrategy extends BaseTimerStrategy {
  isExpired(attempt, currentTime = new Date()) {
    if (!attempt?.deadlineAt) return false;
    return new Date(currentTime) > new Date(attempt.deadlineAt);
  }

  getRemainingSeconds(attempt, currentTime = new Date()) {
    if (!attempt?.deadlineAt) return 0;
    const diffMs = new Date(attempt.deadlineAt).getTime() - new Date(currentTime).getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  }

  validateSubmission({ attempt, currentTime = new Date() }) {
    const isLate = this.isExpired(attempt, currentTime);
    const flags = [];

    if (isLate) {
      flags.push({
        code: 'LATE_SUBMISSION',
        message: 'Attempt submitted after deadline has elapsed',
      });
    }

    return { isLate, flags };
  }
}
