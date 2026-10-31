/**
 * CSV parser using PapaParse.
 * Parses .csv files into { headers, rows }.
 */

import Papa from 'papaparse';
import fs from 'fs';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse a CSV file.
 * @param {string} filePath - Absolute path to the CSV file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[] }}
 */
export const parseCsv = (filePath, options = {}) => {
  const { maxRows = 10000 } = options;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const result = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (header) => header.trim(),
    });

    if (result.errors && result.errors.length > 0) {
      const criticalErrors = result.errors.filter((e) => e.type === 'FieldMismatch');
      if (criticalErrors.length > 0) {
        logger.warn('CSV parsing warnings:', criticalErrors.length, 'field mismatch errors');
      }
    }

    const headers = result.meta.fields || [];
    
    // Clean and filter rows
    const rows = (result.data || [])
      .slice(0, maxRows)
      .map((row) => {
        const cleaned = {};
        headers.forEach((header) => {
          cleaned[header] = cleanCellValue(row[header]);
        });
        return cleaned;
      })
      .filter((row) => !isEmptyRow(row));

    logger.debug(`CSV parsed: ${headers.length} columns, ${rows.length} rows`);

    return { headers, rows };
  } catch (error) {
    logger.error('CSV parsing error:', error.message);
    throw new Error(`Failed to parse CSV file: ${error.message}`);
  }
};

export default { parseCsv };
