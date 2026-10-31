import { BaseParserStrategy } from './BaseParserStrategy.js';
import { parseJson } from '../jsonParser.js';

/**
 * JsonParserStrategy: handles .json files.
 */
export class JsonParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    return String(fileType || '').toLowerCase() === 'json';
  }

  async parse(filePath, options = {}) {
    return parseJson(filePath, options);
  }
}
