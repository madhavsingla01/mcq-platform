/**
 * JSON parser.
 * Parses .json files into { headers, rows }.
 * Supports array-of-objects format.
 */

import fs from 'fs';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse a JSON file.
 * @param {string} filePath - Absolute path to the JSON file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[] }}
 */
export const parseJson = (filePath, options = {}) => {
  const { maxRows = 10000 } = options;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(fileContent);

    // Handle different JSON structures
    if (!Array.isArray(data)) {
      // Check if it has a data/questions/items property that is an array
      const arrayKeys = ['data', 'questions', 'items', 'records', 'rows', 'mcqs'];
      for (const key of arrayKeys) {
        if (data[key] && Array.isArray(data[key])) {
          data = data[key];
          break;
        }
      }
    }

    if (!Array.isArray(data)) {
      // Wrap single object in array
      data = [data];
    }

    if (data.length === 0) {
      return { headers: [], rows: [] };
    }

    // Collect all unique keys from all objects
    const headerSet = new Set();
    data.forEach((item) => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach((key) => headerSet.add(key));
      }
    });

    const headers = Array.from(headerSet);

    // Clean and normalize rows
    const rows = data
      .slice(0, maxRows)
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const cleaned = {};
        headers.forEach((header) => {
          const value = item[header];
          // Handle nested objects/arrays — stringify them
          if (typeof value === 'object' && value !== null) {
            cleaned[header] = JSON.stringify(value);
          } else {
            cleaned[header] = cleanCellValue(value);
          }
        });
        return cleaned;
      })
      .filter((row) => !isEmptyRow(row));

    logger.debug(`JSON parsed: ${headers.length} columns, ${rows.length} rows`);

    return { headers, rows };
  } catch (error) {
    logger.error('JSON parsing error:', error.message);
    throw new Error(`Failed to parse JSON file: ${error.message}`);
  }
};

export default { parseJson };
