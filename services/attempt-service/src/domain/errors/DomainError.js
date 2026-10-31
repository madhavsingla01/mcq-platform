/**
 * Pure domain error hierarchy.
 * Represents core business rule and invariant violations.
 */

export class DomainError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class QuestionLimitExceededError extends DomainError {
  constructor(message = 'Challenges cannot have more than 10 questions') {
    super(message, 400);
  }
}

export class InvalidChallengeTimeError extends DomainError {
  constructor(message = 'Challenges require a valid duration in minutes and future finalization deadline') {
    super(message, 400);
  }
}

export class ChallengeImmutabilityError extends DomainError {
  constructor(message = 'Challenge questions, duration, and rules are immutable once participants have joined') {
    super(message, 409);
  }
}

export class CancellationNotAllowedError extends DomainError {
  constructor(message = 'Cannot delete or cancel after participants have started') {
    super(message, 409);
  }
}

export class DuplicateAttemptError extends DomainError {
  constructor(message = 'Only one attempt is permitted per participant in competitive challenges') {
    super(message, 409);
  }
}
