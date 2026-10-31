import { BaseParserStrategy } from './BaseParserStrategy.js';
import { parseCsv } from '../csvParser.js';

/**
 * CsvParserStrategy: handles delimited files (.csv, .tsv).
 */
export class CsvParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    const norm = String(fileType || '').toLowerCase();
    return norm === 'csv' || norm === 'tsv';
  }

  async parse(filePath, options = {}) {
    return parseCsv(filePath, options);
  }
}
