/**
 * Option extractor service.
 * Handles variable option counts, missing options, and embedded options.
 */

import { logger } from '../../utils/logger.js';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Extract options from a row based on mapped option columns.
 * @param {Object} row - Data row
 * @param {string[]} optionColumns - Mapped option column names
 * @returns {Array<{label: string, text: string}>}
 */
export const extractOptions = (row, optionColumns) => {
  const options = [];

  optionColumns.forEach((col, index) => {
    const value = row[col];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      options.push({
        label: LABELS[index] || String.fromCharCode(65 + index),
        text: String(value).trim(),
      });
    }
  });

  return options;
};

/**
 * Extract options from a single column containing all options.
 * Supports delimiters: |, ;, newline, numbered lists.
 * @param {string} value - Cell value containing multiple options
 * @returns {Array<{label: string, text: string}>}
 */
export const extractOptionsFromSingleColumn = (value) => {
  if (!value || typeof value !== 'string') return [];

  let parts = [];

  // Try pipe delimiter
  if (value.includes('|')) {
    parts = value.split('|');
  }
  // Try semicolon delimiter
  else if (value.includes(';')) {
    parts = value.split(';');
  }
  // Try newline
  else if (value.includes('\n')) {
    parts = value.split('\n');
  }
  // Try numbered list (1. option 2. option)
  else if (/\d+\.\s/.test(value)) {
    parts = value.split(/\d+\.\s/).filter(Boolean);
  }
  // Try lettered list (a) option b) option)
  else if (/[a-d]\)\s/i.test(value)) {
    parts = value.split(/[a-d]\)\s/i).filter(Boolean);
  }

  if (parts.length < 2) return [];

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part, index) => ({
      label: LABELS[index] || String.fromCharCode(65 + index),
      text: part,
    }));
};

/**
 * Validate extracted options.
 * @param {Array<{label: string, text: string}>} options
 * @returns {{ valid: boolean, count: number }}
 */
export const validateOptions = (options) => {
  const validOptions = options.filter((opt) => opt.text && opt.text.length > 0);
  return {
    valid: validOptions.length >= 2,
    count: validOptions.length,
  };
};

export default { extractOptions, extractOptionsFromSingleColumn, validateOptions };
