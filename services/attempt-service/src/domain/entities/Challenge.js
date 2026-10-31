import {
  QuestionLimitExceededError,
  InvalidChallengeTimeError,
  ChallengeImmutabilityError,
  CancellationNotAllowedError,
} from '../errors/DomainError.js';

/**
 * Challenge Entity (Pure OOP Domain Entity)
 * Enforces all competitive quiz invariants and lifecycle rules.
 */
export class Challenge {
  constructor({
    id = null,
    title,
    description = '',
    uploaderId = null,
    questions = [],
    durationMinutes = 0,
    deadlineAt = null,
    accessType = 'public',
    inviteAccessType = null,
    challengeStatus = 'active',
    settings = {},
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.uploaderId = uploaderId ? String(uploaderId) : null;
    this.questions = questions || [];
    this.durationMinutes = Number(durationMinutes) || 0;
    this.deadlineAt = deadlineAt ? new Date(deadlineAt) : null;
    this.accessType = accessType;
    this.inviteAccessType = inviteAccessType;
    this.challengeStatus = challengeStatus;
    this.settings = settings || {};
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Validate creation and update constraints.
   */
  validate() {
    if (!this.title || String(this.title).trim() === '') {
      throw new Error('Challenge title is required');
    }

    if (this.questions.length > 10) {
      throw new QuestionLimitExceededError('Challenges cannot have more than 10 questions');
    }

    if (!this.durationMinutes || this.durationMinutes <= 0) {
      throw new InvalidChallengeTimeError('Challenges require a valid duration in minutes');
    }

    if (!this.deadlineAt || isNaN(this.deadlineAt.getTime()) || this.deadlineAt <= new Date()) {
      throw new InvalidChallengeTimeError('Challenges require a valid future finalization deadline');
    }

    return true;
  }

  /**
   * Asserts that challenge questions, rules, or timings can be modified.
   * Throws 409 if attempts exist.
   */
  assertCanModify(updatePayload, attemptCount = 0) {
    if (attemptCount > 0) {
      const isModifyingQuestions = Array.isArray(updatePayload.questions);
      const isModifyingDuration = updatePayload.durationMinutes !== undefined || updatePayload.settings?.timeLimit !== undefined;
      const isModifyingDeadline = updatePayload.deadlineAt !== undefined;
      const isModifyingRules = updatePayload.settings !== undefined || updatePayload.accessType !== undefined || updatePayload.inviteAccessType !== undefined;

      if (isModifyingQuestions || isModifyingDuration || isModifyingDeadline || isModifyingRules) {
        throw new ChallengeImmutabilityError('Challenge questions, duration, and rules are immutable once participants have joined');
      }
    }
    return true;
  }

  /**
   * Asserts that the challenge can be cancelled/deleted.
   * Allowed only before anyone starts.
   */
  assertCanCancel(attemptCount = 0) {
    if (attemptCount > 0) {
      throw new CancellationNotAllowedError('Cannot delete or cancel after participants have started');
    }
    return true;
  }

  /**
   * Checks whether the challenge deadline has passed.
   */
  isExpired(now = new Date()) {
    if (!this.deadlineAt) return false;
    return now >= this.deadlineAt;
  }

  /**
   * Checks whether leaderboard and participant details should be quarantined.
   */
  isQuarantined(now = new Date()) {
    return !this.isExpired(now);
  }

  /**
   * Marks the challenge as ended.
   */
  end() {
    this.challengeStatus = 'ended';
    this.updatedAt = new Date();
  }
}

export default Challenge;
