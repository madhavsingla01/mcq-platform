const FEED_PROFILE_ROUTES = new Set([
  '/challenges-overview',
  '/feed',
  '/explore',
  '/notifications',
  '/notifications/unread-count',
  '/notifications/read-all',
]);

export function socialServiceForPath(pathname: string): 'feedProfile' | 'interactions' | 'comments' | null {
  if (FEED_PROFILE_ROUTES.has(pathname) ||
      /^\/notifications\/[^/]+\/read$/.test(pathname) ||
      /^\/profile\/[^/]+$/.test(pathname) ||
      /^\/users\/[^/]+\/(quizzes|activity|followers|following|follow)$/.test(pathname)) {
    return 'feedProfile';
  }

  if (pathname === '/bookmarks' || pathname === '/share-contacts' ||
      /^\/quizzes\/[^/]+\/(like|bookmark|share|share-direct)$/.test(pathname)) {
    return 'interactions';
  }

  if (/^\/quizzes\/[^/]+\/comments$/.test(pathname) ||
      /^\/comments\/[^/]+(?:\/like)?$/.test(pathname)) {
    return 'comments';
  }

  return null;
}
