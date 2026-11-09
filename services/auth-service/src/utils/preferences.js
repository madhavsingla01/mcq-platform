import { AppError } from '../middleware/error.middleware.js';

const oneOf = (...values) => (value) => values.includes(value);
const boolean = (value) => typeof value === 'boolean';
const number = (min, max) => (value) => Number.isFinite(value) && value >= min && value <= max;
const category = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80;
const difficulty = oneOf('All Levels', 'Beginner', 'Intermediate', 'Advanced');

// Only documented preferences can be persisted. Keep nested updates partial so
// changing a notification does not overwrite a concurrent privacy preference.
export const preferenceSchema = {
  theme: oneOf('dark', 'oled', 'light'),
  fontSize: oneOf('sm', 'md', 'lg'),
  density: oneOf('comfortable', 'compact'),
  timerVisibility: oneOf('visible', 'hidden'),
  isNavigatorCollapsed: boolean, isAICollapsed: boolean,
  showCorrectAnswerInstantly: boolean, reducedMotion: boolean, focusMode: boolean,
  keyboardShortcutsEnabled: boolean, aiExplanations: boolean,
  aiPersonality: oneOf('Encouraging', 'Concise', 'Socratic', 'Detailed'),
  soundCues: boolean, autoAdvance: boolean, quizTimer: boolean, shuffleQuestions: boolean,
  searchDiscovery: boolean, allowMessagesFrom: oneOf('everyone', 'followers', 'following', 'none'),
  messagingSendOnEnter: boolean, messagingReadReceipts: boolean, messagingTypingIndicators: boolean,
  showOnLeaderboard: boolean, showRankOnProfile: boolean,
  defaultDifficulty: difficulty, primaryCategory: category,
  hideCompletedQuizzes: boolean, filterUnverified: boolean,
  panelWidths: { navigator: number(0, 100), workspace: number(0, 100), ai: number(0, 100) },
  notifications: {
    challengeInvites: boolean, quizResults: boolean, leaderboardUpdates: boolean,
    newFollowers: boolean, commentsAndReplies: boolean, directMessages: boolean,
    emailDigest: oneOf('weekly', 'monthly', 'off'),
  },
  challenges: {
    accept: oneOf('always', 'followers', 'never'), timeLimit: oneOf(30, 60, 90, 120),
    showOnLeaderboards: boolean, showRankOnProfile: boolean,
  },
  feed: {
    defaultDifficulty: difficulty, preferredCategory: category,
    hideCompletedQuizzes: boolean, filterUnverified: boolean,
  },
};

const isPlainObject = (value) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function validatePreferences(value, schema = preferenceSchema, path = 'preferences') {
  if (!isPlainObject(value)) throw new AppError(`${path} must be an object`, 400);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(schema, key)) throw new AppError(`Unknown preference: ${path}.${key}`, 400);
    const rule = schema[key];
    if (typeof rule === 'function') {
      if (!rule(item)) throw new AppError(`Invalid value for ${path}.${key}`, 400);
      result[key] = item;
    } else {
      result[key] = validatePreferences(item, rule, `${path}.${key}`);
    }
  }
  return result;
}

export function preferenceUpdates(preferences, prefix = 'preferences') {
  const result = {};
  for (const [key, value] of Object.entries(preferences)) {
    const path = `${prefix}.${key}`;
    if (isPlainObject(value)) Object.assign(result, preferenceUpdates(value, path));
    else result[path] = value;
  }
  return result;
}
