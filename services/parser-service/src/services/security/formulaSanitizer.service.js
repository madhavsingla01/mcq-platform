/**
 * Formula Sanitizer Service (Feature F7: Formula Injection & Input Sanitization)
 * Neutralizes CSV/Spreadsheet formula injection vectors (CWE-1236)
 * while safely preserving legitimate numeric values.
 */

// Formula trigger characters including tab, carriage return, pipe, and Unicode full-width variants
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r', '|', '\uFF1D', '\uFF0B', '\uFF0D', '\uFF20'];

// Regex matching pure numeric literals (integers, decimals, scientific notation)
const NUMERIC_LITERAL_REGEX = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Checks if a value constitutes a potential formula injection payload.
 * Legitimate negative numbers (e.g., -42, -3.14) and positive numbers (+5)
 * are exempt from neutralization.
 *
 * @param {*} val - Cell or input value
 * @returns {boolean} - True if value is an injection threat
 */
export function isFormulaInjection(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return false;
  if (typeof val !== 'string') return false;
  if (val.length === 0) return false;

  // Strip zero-width characters before inspection (\u200B, \uFEFF)
  const stripped = val.replace(/[\u200B\uFEFF]/g, '');
  if (stripped.length === 0) return false;

  // Trim leading whitespace for inspection
  const trimmed = stripped.trim();
  if (trimmed.length === 0) return false;

  // Check numeric exemption: legitimate numbers are not formulas
  if (NUMERIC_LITERAL_REGEX.test(trimmed)) {
    return false;
  }

  // Check if string or trimmed string starts with any formula trigger character
  const startsWithTrigger = FORMULA_TRIGGERS.some(
    (char) => stripped.startsWith(char) || trimmed.startsWith(char)
  );

  return startsWithTrigger;
}

/**
 * Neutralizes a cell value by prepending a single quote (') if it represents
 * a formula injection vector.
 *
 * @param {*} val - Raw cell value
 * @returns {*} - Sanitized value (prefixed with ' if formula)
 */
export function sanitizeFormulaPrefix(val) {
  if (typeof val !== 'string') return val;
  if (val.length === 0) return val;

  if (isFormulaInjection(val)) {
    // Avoid double quoting if already sanitized
    if (val.startsWith("'")) {
      return val;
    }
    return `'${val}`;
  }

  return val;
}

/**
 * Strips HTML <script> tags and executable markup from metadata or user strings.
 *
 * @param {string} str - Input metadata string
 * @returns {string} - Sanitized string
 */
export function sanitizeMetadataString(str) {
  if (typeof str !== 'string') return str;

  // Strip all HTML tags while preserving inner text content
  return str.replace(/<[^>]*>?/gm, '');
}

/**
 * Sanitizes an object of metadata fields.
 *
 * @param {Object} metadata - Metadata object
 * @returns {Object} - Sanitized metadata
 */
export function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeMetadataString(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Sanitizes tabular data (either Array of row objects or 2D Array of cells).
 *
 * @param {Array<Object>|Array<Array<any>>} rows - Table rows
 * @returns {Array<Object>|Array<Array<any>>} - Sanitized rows
 */
export function sanitizeTabularData(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    if (!row) return row;

    if (Array.isArray(row)) {
      // 2D Array row
      return row.map((cell) => sanitizeFormulaPrefix(cell));
    }

    if (typeof row === 'object') {
      // Object row with column keys
      const sanitizedRow = {};
      for (const [key, val] of Object.entries(row)) {
        sanitizedRow[key] = sanitizeFormulaPrefix(val);
      }
      return sanitizedRow;
    }

    return sanitizeFormulaPrefix(row);
  });
}

export const sanitizeTabularRows = sanitizeTabularData;

export default {
  isFormulaInjection,
  sanitizeFormulaPrefix,
  sanitizeMetadataString,
  sanitizeMetadata,
  sanitizeTabularData,
  sanitizeTabularRows,
};
