import { BaseParserStrategy } from './BaseParserStrategy.js';
import { parseExcel } from '../excelParser.js';

/**
 * ExcelParserStrategy: handles .xlsx and .xls workbooks.
 */
export class ExcelParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    const norm = String(fileType || '').toLowerCase();
    return norm === 'xlsx' || norm === 'xls' || norm === 'spreadsheet' || norm.includes('spreadsheet') || norm.includes('ms-excel');
  }

  async parse(filePath, options = {}) {
    return parseExcel(filePath, options);
  }
}
