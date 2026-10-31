import { ExcelParserStrategy } from './ExcelParserStrategy.js';
import { CsvParserStrategy } from './CsvParserStrategy.js';
import { JsonParserStrategy } from './JsonParserStrategy.js';
import { AppError } from '../../../middleware/error.middleware.js';

/**
 * ParserRegistry (SOLID: Open/Closed Principle & Dependency Inversion)
 * Manages all supported file parser strategies and resolves the appropriate
 * parser without requiring consumers to modify their code.
 */
class ParserRegistryImpl {
  constructor() {
    this.strategies = [];
    // Register default built-in strategies
    this.register(new ExcelParserStrategy());
    this.register(new CsvParserStrategy());
    this.register(new JsonParserStrategy());
  }

  /**
   * Register a new parsing strategy dynamically.
   * Open for extension: new formats like Markdown, YAML, Google Sheets can be added here.
   * @param {BaseParserStrategy} strategy
   */
  register(strategy) {
    if (!strategy || typeof strategy.supports !== 'function' || typeof strategy.parse !== 'function') {
      throw new Error('Strategy must implement BaseParserStrategy interface (supports, parse)');
    }
    // Prepend so customized/later registered strategies can override if needed
    this.strategies.unshift(strategy);
  }

  /**
   * Find strategy for a file type.
   * @param {string} fileType
   * @returns {BaseParserStrategy}
   */
  getStrategy(fileType) {
    const strategy = this.strategies.find((s) => s.supports(fileType));
    if (!strategy) {
      throw new AppError(`Unsupported file type: ${fileType}. Supported types: ${this.getSupportedTypes().join(', ')}`, 400);
    }
    return strategy;
  }

  /**
   * Parse a file directly through the resolved strategy.
   * @param {string} fileType
   * @param {string} filePath
   * @param {Object} options
   */
  async parse(fileType, filePath, options = {}) {
    const strategy = this.getStrategy(fileType);
    return strategy.parse(filePath, options);
  }

  /**
   * List all currently supported extensions.
   * @returns {string[]}
   */
  getSupportedTypes() {
    const commonTypes = ['xlsx', 'xls', 'csv', 'tsv', 'json'];
    return commonTypes.filter((t) => this.strategies.some((s) => s.supports(t)));
  }
}

export const ParserRegistry = new ParserRegistryImpl();
export default ParserRegistry;
