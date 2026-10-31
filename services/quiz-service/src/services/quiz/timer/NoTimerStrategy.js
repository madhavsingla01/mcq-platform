import { BaseTimerStrategy } from './BaseTimerStrategy.js';

export class NoTimerStrategy extends BaseTimerStrategy {
  isExpired() {
    return false;
  }

  getRemainingSeconds() {
    return Infinity;
  }

  validateSubmission() {
    return { isLate: false, flags: [] };
  }
}
