const localOrigin = 'https://quizfocus.invalid';

export function authRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /^\/(?:[\\/]|%2f|%5c)/i.test(value) || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return '/dashboard';
  }
  const target = new URL(value, localOrigin);
  if (target.origin !== localOrigin || /^\/(?:\/|%2f|%5c|(?:login|register)\/?$)/i.test(target.pathname)) return '/dashboard';
  return target.pathname + target.search + target.hash;
}
