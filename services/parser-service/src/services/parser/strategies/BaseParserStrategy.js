/**
 * BaseParserStrategy (SOLID: Open/Closed Principle & Liskov Substitution Principle)
 * Contract for all file parsing strategies.
 */
export class BaseParserStrategy {
  /**
   * Returns whether this strategy supports the given file extension or MIME type.
   * @param {string} fileType - Extension without dot (e.g., 'csv', 'xlsx')
   * @returns {boolean}
   */
  supports(fileType) {
    throw new Error('supports(fileType) must be implemented by subclass');
  }

  /**
   * Parse file and return standardized headers, rows, and metadata.
   * @param {string} filePath - Absolute path to file
   * @param {Object} options - Strategy-specific parsing options
   * @returns {Promise<{ headers: string[], rows: Object[], sheetNames?: string[] }>}
   */
  async parse(filePath, options = {}) {
    throw new Error('parse(filePath, options) must be implemented by subclass');
  }
}
