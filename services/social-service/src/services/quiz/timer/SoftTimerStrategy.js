import { BaseTimerStrategy } from './BaseTimerStrategy.js';

export class SoftTimerStrategy extends BaseTimerStrategy {
  isExpired() {
    // Soft timer allows submission even after time expires
    return false;
  }

  getRemainingSeconds(attempt, currentTime = new Date()) {
    if (!attempt?.deadlineAt) return 0;
    const diffMs = new Date(attempt.deadlineAt).getTime() - new Date(currentTime).getTime();
    return Math.floor(diffMs / 1000); // Can be negative for overtime
  }

  validateSubmission({ attempt, currentTime = new Date() }) {
    const isOvertime = Boolean(attempt?.deadlineAt && new Date(currentTime) > new Date(attempt.deadlineAt));
    const flags = [];

    if (isOvertime) {
      flags.push({
        code: 'OVERTIME_SUBMISSION',
        message: 'Completed with overtime penalty',
      });
    }

    return { isLate: false, isOvertime, flags };
  }
}
