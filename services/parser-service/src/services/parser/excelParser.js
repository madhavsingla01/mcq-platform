/**
 * Excel parser using SheetJS (xlsx).
 * Parses .xlsx and .xls files into { headers, rows }.
 */

import XLSX from 'xlsx';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { sanitizeFormulaPrefix } from '../security/formulaSanitizer.service.js';
import { logger } from '../../utils/logger.js';
import env from '../../config/env.js';

/**
 * Parse an Excel file.
 * @param {string} filePath - Absolute path to the Excel file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[], sheetNames: string[], allSheets: Object[], metadata: Object }}
 */
export const parseExcel = (filePath, options = {}) => {
  const { sheetIndex = 0, maxRows = env.MAX_IMPORT_ROWS } = options;

  try {
    const workbook = XLSX.readFile(filePath, {
      type: 'file',
      cellText: true,
      cellDates: true,
      sheetRows: maxRows + 1,
    });
    const sheetNames = workbook.SheetNames || [];

    // Extract all sheets
    const sheetsData = [];
    for (const sheet of sheetNames) {
      const s = workbook.Sheets[sheet];
      const rawData = XLSX.utils.sheet_to_json(s, { defval: '', raw: false });
      if (rawData.length > 0) {
        const rawHeaders = Object.keys(rawData[0]);
        // Sanitize column headers against formula injection
        const headers = rawHeaders.map((h) => sanitizeFormulaPrefix(h));
        const rows = rawData.slice(0, maxRows).map((row) => {
          const cleaned = {};
          rawHeaders.forEach((rawHeader, idx) => {
            const sanitizedHeader = headers[idx];
            cleaned[sanitizedHeader] = cleanCellValue(row[rawHeader]);
          });
          return cleaned;
        }).filter((row) => !isEmptyRow(row));

        sheetsData.push({ sheetName: sheet, headers, rows });
      }
    }

    if (sheetsData.length === 0) {
      return {
        headers: [],
        rows: [],
        sheetNames,
        allSheets: [],
        metadata: {
          format: 'spreadsheet',
          sheetNames,
          sheetCount: sheetNames.length,
          totalRows: 0,
          totalCols: 0,
          rowCount: 0,
          columnCount: 0,
          headers: [],
          sheets: [],
        },
      };
    }

    // Default to first non-empty sheet, but include all data and metadata
    const firstSheet = sheetsData[0];
    const totalRows = firstSheet.rows.length;
    const totalCols = firstSheet.headers.length;

    const metadata = {
      format: 'spreadsheet',
      sheetNames,
      sheetCount: sheetNames.length,
      totalRows,
      totalCols,
      rowCount: totalRows,
      columnCount: totalCols,
      headers: firstSheet.headers,
      sheets: sheetsData.map((s) => ({
        name: s.sheetName,
        rowCount: s.rows.length,
        columnCount: s.headers.length,
        headers: s.headers,
      })),
    };
    
    logger.debug(`Excel parsed: ${sheetsData.length} valid sheets`);

    return { 
      headers: firstSheet.headers, 
      rows: firstSheet.rows, 
      sheetNames,
      allSheets: sheetsData,
      metadata,
    };
  } catch (error) {
    logger.error('Excel parsing error:', error.message);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

export default { parseExcel };
