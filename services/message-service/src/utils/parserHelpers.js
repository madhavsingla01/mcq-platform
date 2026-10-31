/**
 * Parser helper utilities shared across all file parsers.
 */

/**
 * Check if a row is empty or all whitespace.
 * @param {Object} row - Row object with column values
 * @returns {boolean}
 */
export const isEmptyRow = (row) => {
  if (!row || typeof row !== 'object') return true;
  return Object.values(row).every(
    (val) => val === null || val === undefined || String(val).trim() === ''
  );
};

/**
 * Clean a cell value — trim, normalize whitespace.
 * @param {*} value - Raw cell value
 * @returns {string}
 */
export const cleanCellValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
};

/**
 * Infer the data type of a cell value.
 * @param {*} value - Cell value
 * @returns {'number'|'boolean'|'string'|'empty'}
 */
export const inferDataType = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return 'empty';
  if (typeof value === 'number' || !isNaN(Number(value))) return 'number';
  if (/^(true|false|yes|no)$/i.test(String(value).trim())) return 'boolean';
  return 'string';
};

/**
 * Get column statistics for a set of rows.
 * @param {Object[]} rows - Array of row objects
 * @param {string} column - Column key
 * @returns {{ nonEmpty: number, avgLength: number, types: Object }}
 */
export const getColumnStats = (rows, column) => {
  let nonEmpty = 0;
  let totalLength = 0;
  const types = {};

  rows.forEach((row) => {
    const val = row[column];
    const type = inferDataType(val);
    types[type] = (types[type] || 0) + 1;

    if (type !== 'empty') {
      nonEmpty++;
      totalLength += String(val).length;
    }
  });

  return {
    nonEmpty,
    avgLength: nonEmpty > 0 ? Math.round(totalLength / nonEmpty) : 0,
    types,
  };
};

/**
 * Validate minimum data requirements for parsed content.
 * @param {{ headers: string[], rows: Object[] }} data - Parsed data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export const validateParsedData = (data) => {
  const errors = [];

  if (!data.headers || data.headers.length === 0) {
    errors.push('No headers detected in file');
  }

  if (!data.rows || data.rows.length === 0) {
    errors.push('No data rows found in file');
  }

  if (data.headers && data.headers.length > 50) {
    errors.push('Too many columns detected (max: 50)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export default { isEmptyRow, cleanCellValue, inferDataType, getColumnStats, validateParsedData };
