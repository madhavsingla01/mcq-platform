/**
 * CSV parser using PapaParse.
 * Parses .csv files into { headers, rows }.
 */

import Papa from 'papaparse';
import fs from 'fs';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { sanitizeFormulaPrefix } from '../security/formulaSanitizer.service.js';
import { logger } from '../../utils/logger.js';
import env from '../../config/env.js';

/**
 * Parse a CSV file.
 * @param {string} filePath - Absolute path to the CSV file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[], sheetNames: string[], metadata: Object }}
 */
export const parseCsv = (filePath, options = {}) => {
  const { maxRows = env.MAX_IMPORT_ROWS } = options;

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

    const rawHeaders = result.meta.fields || [];
    // Sanitize headers against formula injection triggers while preserving numeric names
    const headers = rawHeaders.map((h) => sanitizeFormulaPrefix(h));
    
    // Clean and filter rows
    const rows = (result.data || [])
      .slice(0, maxRows)
      .map((row) => {
        const cleaned = {};
        rawHeaders.forEach((rawHeader, idx) => {
          const sanitizedHeader = headers[idx];
          cleaned[sanitizedHeader] = cleanCellValue(row[rawHeader]);
        });
        return cleaned;
      })
      .filter((row) => !isEmptyRow(row));

    const totalRows = rows.length;
    const totalCols = headers.length;

    const metadata = {
      format: 'csv',
      sheetNames: ['Sheet1'],
      sheetCount: 1,
      totalRows,
      totalCols,
      rowCount: totalRows,
      columnCount: totalCols,
      headers,
    };

    logger.debug(`CSV parsed: ${headers.length} columns, ${rows.length} rows`);

    return { headers, rows, sheetNames: ['Sheet1'], metadata };
  } catch (error) {
    logger.error('CSV parsing error:', error.message);
    throw new Error(`Failed to parse CSV file: ${error.message}`);
  }
};

export default { parseCsv };
