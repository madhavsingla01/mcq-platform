/**
 * Excel parser using SheetJS (xlsx).
 * Parses .xlsx and .xls files into { headers, rows }.
 */

import XLSX from 'xlsx';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse an Excel file.
 * @param {string} filePath - Absolute path to the Excel file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[], sheetNames: string[] }}
 */
export const parseExcel = (filePath, options = {}) => {
  const { sheetIndex = 0, maxRows = 10000 } = options;

  try {
    const workbook = XLSX.readFile(filePath, {
      type: 'file',
      cellText: true,
      cellDates: true,
    });
    const sheetNames = workbook.SheetNames || [];

    // Extract all sheets
    const sheetsData = [];
    for (const sheet of sheetNames) {
      const s = workbook.Sheets[sheet];
      const rawData = XLSX.utils.sheet_to_json(s, { defval: '', raw: false });
      if (rawData.length > 0) {
        const headers = Object.keys(rawData[0]);
        const rows = rawData.slice(0, maxRows).map((row) => {
          const cleaned = {};
          headers.forEach((header) => {
            cleaned[header] = cleanCellValue(row[header]);
          });
          return cleaned;
        }).filter((row) => !isEmptyRow(row));

        sheetsData.push({ sheetName: sheet, headers, rows });
      }
    }

    if (sheetsData.length === 0) {
      return { headers: [], rows: [], sheetNames, allSheets: [] };
    }

    // Default to first non-empty sheet for MVP, but include all data
    const firstSheet = sheetsData[0];
    
    logger.debug(`Excel parsed: ${sheetsData.length} valid sheets`);

    return { 
      headers: firstSheet.headers, 
      rows: firstSheet.rows, 
      sheetNames,
      allSheets: sheetsData 
    };
  } catch (error) {
    logger.error('Excel parsing error:', error.message);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

export default { parseExcel };
