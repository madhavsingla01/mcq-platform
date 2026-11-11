export function isProfilePrivate(user) {
  return user?.isPrivate === true || user?.isProfilePublic === false;
}

export function profilePrivacyUpdate(isPrivate) {
  return { isPrivate, isProfilePublic: !isPrivate };
}
