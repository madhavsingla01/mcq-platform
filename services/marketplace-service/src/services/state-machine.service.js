/**
 * Marketplace Listing State Machine
 *
 * Valid states:
 * - 'draft'
 * - 'pending_review'
 * - 'published'
 * - 'archived'
 *
 * Allowed lifecycle transitions:
 * - draft -> pending_review
 * - pending_review -> published
 * - pending_review -> draft (rejection / recall)
 * - published -> archived
 * - archived -> draft (re-activation for updates)
 *
 * Forbidden transitions:
 * - draft -> published (must undergo review)
 * - archived -> published (must go through draft & review)
 * - any invalid state or self-loop
 */

export const LISTING_STATUSES = Object.freeze({
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const ALLOWED_TRANSITIONS = new Map([
  [LISTING_STATUSES.DRAFT, new Set([LISTING_STATUSES.PENDING_REVIEW])],
  [LISTING_STATUSES.PENDING_REVIEW, new Set([LISTING_STATUSES.PUBLISHED, LISTING_STATUSES.DRAFT])],
  [LISTING_STATUSES.PUBLISHED, new Set([LISTING_STATUSES.ARCHIVED])],
  [LISTING_STATUSES.ARCHIVED, new Set([LISTING_STATUSES.DRAFT])],
]);

export class InvalidStateTransitionError extends Error {
  constructor(fromStatus, toStatus, reason) {
    const defaultMsg = `Illegal state transition from '${fromStatus}' to '${toStatus}'. Direct transitions are prohibited by the marketplace state machine.`;
    super(reason || defaultMsg);
    this.name = 'InvalidStateTransitionError';
    this.code = 'INVALID_STATE_TRANSITION';
    this.statusCode = 400;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

/**
 * Checks whether a transition between two statuses is allowed.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return false;
  const allowedNext = ALLOWED_TRANSITIONS.get(fromStatus);
  return !!allowedNext && allowedNext.has(toStatus);
}

/**
 * Validates a proposed state transition, throwing InvalidStateTransitionError if illegal.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @throws {InvalidStateTransitionError}
 */
export function validateStateTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    throw new InvalidStateTransitionError(
      fromStatus,
      toStatus,
      `Cannot transition from '${fromStatus}' to the same status '${toStatus}'.`
    );
  }

  if (fromStatus === LISTING_STATUSES.DRAFT && toStatus === LISTING_STATUSES.PUBLISHED) {
    throw new InvalidStateTransitionError(
      fromStatus,
      toStatus,
      "Direct publication from 'draft' is prohibited. Listing must enter 'pending_review' first."
    );
  }

  if (fromStatus === LISTING_STATUSES.ARCHIVED && toStatus === LISTING_STATUSES.PUBLISHED) {
    throw new InvalidStateTransitionError(
      fromStatus,
      toStatus,
      "Archived listings cannot be published directly. Must be restored to 'draft' and reviewed before re-publishing."
    );
  }

  const allowedNext = ALLOWED_TRANSITIONS.get(fromStatus);
  if (!allowedNext || !allowedNext.has(toStatus)) {
    throw new InvalidStateTransitionError(
      fromStatus,
      toStatus,
      `State transition from '${fromStatus}' to '${toStatus}' is invalid.`
    );
  }
}

/**
 * Applies a validated state transition to a listing object/document,
 * setting appropriate timestamps and lifecycle metadata.
 *
 * @param {Object} listing - The listing document or object
 * @param {string} targetStatus - The new status to transition to
 * @param {Object} [options]
 * @param {Date} [options.timestamp] - Transition timestamp (defaults to now)
 * @returns {Object} The updated listing
 */
export function transitionListing(listing, targetStatus, options = {}) {
  const currentStatus = listing.status || LISTING_STATUSES.DRAFT;
  validateStateTransition(currentStatus, targetStatus);

  const now = options.timestamp || new Date();
  listing.status = targetStatus;

  if (targetStatus === LISTING_STATUSES.PUBLISHED) {
    listing.publishedAt = now;
    listing.archivedAt = null;
  } else if (targetStatus === LISTING_STATUSES.ARCHIVED) {
    listing.archivedAt = now;
  } else if (targetStatus === LISTING_STATUSES.DRAFT && currentStatus === LISTING_STATUSES.ARCHIVED) {
    // Restoring from archived
    listing.archivedAt = null;
    listing.publishedAt = null;
  }

  return listing;
}

export default {
  LISTING_STATUSES,
  canTransition,
  validateStateTransition,
  transitionListing,
  InvalidStateTransitionError,
};
