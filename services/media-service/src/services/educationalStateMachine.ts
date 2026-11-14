import { AppError } from '../middleware/error.middleware.js';

export const LIFECYCLE_STATES = Object.freeze({
  INITIATED: 'initiated',
  UPLOADED: 'uploaded',
  SCANNING: 'scanning',
  PROCESSING: 'processing',
  READY: 'ready',
  REJECTED: 'rejected',
  FAILED: 'failed',
  QUARANTINED: 'quarantined',
});

export type LifecycleState = typeof LIFECYCLE_STATES[keyof typeof LIFECYCLE_STATES];

export const ALLOWED_TRANSITIONS: Readonly<Record<LifecycleState, ReadonlySet<LifecycleState>>> = Object.freeze({
  [LIFECYCLE_STATES.INITIATED]: new Set([
    LIFECYCLE_STATES.UPLOADED,
    LIFECYCLE_STATES.FAILED,
    LIFECYCLE_STATES.REJECTED,
  ]),
  [LIFECYCLE_STATES.UPLOADED]: new Set([
    LIFECYCLE_STATES.SCANNING,
    LIFECYCLE_STATES.FAILED,
    LIFECYCLE_STATES.QUARANTINED,
    LIFECYCLE_STATES.REJECTED,
  ]),
  [LIFECYCLE_STATES.SCANNING]: new Set([
    LIFECYCLE_STATES.PROCESSING,
    LIFECYCLE_STATES.FAILED,
    LIFECYCLE_STATES.QUARANTINED,
    LIFECYCLE_STATES.REJECTED,
  ]),
  [LIFECYCLE_STATES.PROCESSING]: new Set([
    LIFECYCLE_STATES.READY,
    LIFECYCLE_STATES.FAILED,
    LIFECYCLE_STATES.QUARANTINED,
    LIFECYCLE_STATES.REJECTED,
  ]),
  [LIFECYCLE_STATES.FAILED]: new Set([
    LIFECYCLE_STATES.SCANNING,
    LIFECYCLE_STATES.PROCESSING,
  ]),
  [LIFECYCLE_STATES.READY]: new Set<LifecycleState>(),
  [LIFECYCLE_STATES.REJECTED]: new Set<LifecycleState>(),
  [LIFECYCLE_STATES.QUARANTINED]: new Set<LifecycleState>(),
});

export const TERMINAL_STATES = new Set([
  LIFECYCLE_STATES.READY,
  LIFECYCLE_STATES.REJECTED,
  LIFECYCLE_STATES.QUARANTINED,
]);

const validState = (value: unknown): value is LifecycleState =>
  typeof value === 'string' && Object.hasOwn(ALLOWED_TRANSITIONS, value);

export function canTransition(currentStatus: unknown, targetStatus: unknown, processingAttempts = 0) {
  if (!validState(currentStatus) || !validState(targetStatus)) return false;
  if (currentStatus === targetStatus) return false; // Prohibit self-loops
  if (currentStatus === LIFECYCLE_STATES.FAILED && processingAttempts >= 3) return false; // Max retry attempts reached
  return ALLOWED_TRANSITIONS[currentStatus].has(targetStatus);
}

export function validateTransition(currentStatus: string, targetStatus: string, processingAttempts = 0) {
  if (!canTransition(currentStatus, targetStatus, processingAttempts)) {
    throw new AppError(
      `Invalid lifecycle state transition from '${currentStatus}' to '${targetStatus}'`,
      409,
      { currentStatus, targetStatus, processingAttempts }
    );
  }
}
