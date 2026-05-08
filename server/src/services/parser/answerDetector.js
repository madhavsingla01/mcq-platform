/**
 * Answer detector service.
 * Determines the format of answers in a dataset and normalizes them.
 */

import { detectAnswerFormat, matchAnswerToOption } from '../../utils/detectAnswer.js';
import { logger } from '../../utils/logger.js';

/**
 * Analyze the answer column to determine the dominant format.
 * @param {Object[]} rows - Data rows
 * @param {string} answerColumn - Column name containing answers
 * @returns {{ format: string, distribution: Object }}
 */
export const analyzeAnswerFormat = (rows, answerColumn) => {
  const distribution = { letter: 0, number: 0, boolean: 0, text: 0, unknown: 0 };
  const sampleSize = Math.min(rows.length, 50);

  for (let i = 0; i < sampleSize; i++) {
    const { type } = detectAnswerFormat(rows[i][answerColumn]);
    distribution[type] = (distribution[type] || 0) + 1;
  }

  // Find dominant format
  const format = Object.entries(distribution)
    .filter(([key]) => key !== 'unknown')
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'text';

  logger.debug(`Answer format analysis: dominant="${format}"`, distribution);

  return { format, distribution };
};

/**
 * Normalize an answer value to a consistent option label (A, B, C, D).
 * @param {*} answer - Raw answer value
 * @param {Array<{label: string, text: string}>} options - Available options
 * @returns {string} Normalized answer label (A, B, C, D) or original
 */
export const normalizeAnswer = (answer, options) => {
  if (!answer || !options || options.length === 0) return '';

  const { type, value } = detectAnswerFormat(answer);

  switch (type) {
    case 'letter':
      return value; // Already A, B, C, D

    case 'number': {
      const index = parseInt(value) - 1;
      if (index >= 0 && index < options.length) {
        return options[index].label;
      }
      return value;
    }

    case 'text': {
      // Try to match text to an option
      const matchIndex = matchAnswerToOption(answer, options);
      if (matchIndex >= 0) {
        return options[matchIndex].label;
      }
      return value;
    }

    case 'boolean':
      return value;

    default:
      return String(answer).trim();
  }
};

export default { analyzeAnswerFormat, normalizeAnswer };
