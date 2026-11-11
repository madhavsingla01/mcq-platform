export const reconcileAttemptSnapshot = (localSnapshot, serverAttempt) => {
  if (!localSnapshot) {
    return { snapshot: null, stale: false };
  }

  if (!serverAttempt || localSnapshot.attemptId !== serverAttempt._id) {
    return { snapshot: null, stale: true };
  }

  return { snapshot: localSnapshot, stale: false };
};
