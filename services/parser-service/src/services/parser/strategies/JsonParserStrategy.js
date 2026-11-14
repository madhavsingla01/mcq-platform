import { BaseParserStrategy } from './BaseParserStrategy.js';
import { parseJson } from '../jsonParser.js';

/**
 * JsonParserStrategy: handles .json files.
 */
export class JsonParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    const norm = String(fileType || '').toLowerCase();
    return norm === 'json' || norm === 'mcq_bank' || norm === 'application/json' || norm.includes('json');
  }

  async parse(filePath, options = {}) {
    return parseJson(filePath, options);
  }
}
