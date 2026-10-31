import crypto from 'crypto';
import fs from 'fs';
import Quiz from '../../models/Quiz.model.js';
import { logger } from '../../utils/logger.js';

// Concurrency registry for simultaneous uploads / quiz generations by fileHash
const inFlightGenerations = new Map();

/**
 * Generate SHA-256 fingerprint from a file path or buffer.
 * @param {string|Buffer} source - Path to file or Buffer
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export const calculateFileHash = (source) => {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(source)) {
      const hash = crypto.createHash('sha256').update(source).digest('hex');
      return resolve(hash);
    }

    if (typeof source !== 'string') {
      return reject(new Error('Invalid source provided for file hash calculation'));
    }

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(source);
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

/**
 * Look up existing quiz by file hash.
 * Prioritizes a quiz owned by the current uploader if available, otherwise any existing quiz.
 * @param {Object} params
 * @param {string} params.fileHash
 * @param {string|null} [params.uploaderId]
 * @returns {Promise<Object|null>} Existing quiz or null
 */
export const findDuplicateQuiz = async ({ fileHash, uploaderId = null }) => {
  if (!fileHash) return null;

  if (uploaderId) {
    const userQuiz = await Quiz.findOne({ fileHash, uploader: uploaderId })
      .sort({ createdAt: -1 })
      .select('_id title questionCount uploader isPublic visibility createdAt settings');
    if (userQuiz) return userQuiz;
  }

  return Quiz.findOne({ fileHash })
    .sort({ createdAt: -1 })
    .select('_id title questionCount uploader isPublic visibility createdAt settings');
};

/**
 * Executes a generation task with concurrency locking by fileHash.
 * If another request is currently generating a quiz for the exact same fileHash,
 * subsequent requests will wait for the in-flight generation rather than creating duplicate quizzes.
 *
 * @param {string} fileHash
 * @param {Function} generationFn
 * @returns {Promise<{ quiz: Object, isDuplicate: boolean }>}
 */
export const withGenerationLock = async (fileHash, generationFn) => {
  if (!fileHash) {
    const result = await generationFn();
    return { quiz: result.quiz, isDuplicate: false, questionCount: result.questionCount, errors: result.errors };
  }

  // If another request is currently generating for this exact hash, await its completion
  const existingPromise = inFlightGenerations.get(fileHash);
  if (existingPromise) {
    logger.info(`Concurrent generation detected for fileHash ${fileHash}. Awaiting in-flight generation...`);
    try {
      const existing = await existingPromise;
      if (existing?.quiz) {
        return {
          quiz: existing.quiz,
          isDuplicate: true,
          existingQuizId: existing.quiz._id,
          questionCount: existing.quiz.questionCount,
          errors: [],
        };
      }
    } catch {
      // If the in-flight failed, continue with current attempt
    }
  }

  let resolveLock;
  let rejectLock;
  const lockPromise = new Promise((resolve, reject) => {
    resolveLock = resolve;
    rejectLock = reject;
  });

  // SYNCHRONOUSLY set lock into map immediately before any await
  inFlightGenerations.set(fileHash, lockPromise);

  try {
    // Check if quiz already exists in DB
    const existingQuiz = await findDuplicateQuiz({ fileHash });
    if (existingQuiz) {
      const duplicateResult = {
        quiz: existingQuiz,
        isDuplicate: true,
        existingQuizId: existingQuiz._id,
        questionCount: existingQuiz.questionCount,
        errors: [],
      };
      resolveLock(duplicateResult);
      return duplicateResult;
    }

    const result = await generationFn();
    resolveLock(result);
    return { ...result, isDuplicate: false };
  } catch (err) {
    rejectLock(err);
    throw err;
  } finally {
    inFlightGenerations.delete(fileHash);
  }
};

export default {
  calculateFileHash,
  findDuplicateQuiz,
  withGenerationLock,
};
