/**
 * BaseTimerStrategy (SOLID: Single Responsibility & Liskov Substitution Principle)
 * Contract for timer strategies in quiz attempts.
 */
export class BaseTimerStrategy {
  /**
   * Determine if the attempt has exceeded its allowed duration.
   * @param {Object} attempt
   * @param {Date} [currentTime]
   * @returns {boolean}
   */
  isExpired(attempt, currentTime = new Date()) {
    throw new Error('isExpired() must be implemented');
  }

  /**
   * Calculate remaining seconds (or Infinity if unlimited).
   * @param {Object} attempt
   * @param {Date} [currentTime]
   * @returns {number}
   */
  getRemainingSeconds(attempt, currentTime = new Date()) {
    throw new Error('getRemainingSeconds() must be implemented');
  }

  /**
   * Validate submission timing and flag anomalies.
   * @param {Object} params
   * @param {Object} params.attempt
   * @param {Date} [params.currentTime]
   * @returns {{ isLate: boolean, flags: Array<{ code: string, message: string }> }}
   */
  validateSubmission({ attempt, currentTime = new Date() }) {
    throw new Error('validateSubmission() must be implemented');
  }
}
