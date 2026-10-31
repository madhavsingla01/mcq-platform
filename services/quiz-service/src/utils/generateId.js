import { randomUUID } from 'crypto';

/**
 * Generate a UUID v4.
 */
export const generateUUID = () => randomUUID();

/**
 * Generate a short share code for quizzes.
 */
export const generateShareCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a numeric ID from timestamp.
 */
export const generateNumericId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

export default { generateUUID, generateShareCode, generateNumericId };
