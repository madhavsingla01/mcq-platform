/**
 * Normalize column headers for consistent matching.
 */

/**
 * Normalize a single column header string.
 * @param {string} header - Raw header string
 * @returns {string} Normalized header
 */
export const normalizeHeader = (header) => {
  if (!header || typeof header !== 'string') return '';
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')  // Replace special chars with underscore
    .replace(/_+/g, '_')           // Collapse multiple underscores
    .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
};

/**
 * Normalize an array of column headers.
 * @param {string[]} headers - Array of raw header strings
 * @returns {string[]} Normalized headers
 */
export const normalizeHeaders = (headers) => {
  if (!Array.isArray(headers)) return [];
  return headers.map(normalizeHeader);
};

/**
 * Create a mapping from normalized → original headers.
 * @param {string[]} headers - Array of raw header strings
 * @returns {Map<string, string>} Map of normalized → original
 */
export const createHeaderMap = (headers) => {
  const map = new Map();
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (normalized) {
      map.set(normalized, header);
    }
  });
  return map;
};

export default { normalizeHeader, normalizeHeaders, createHeaderMap };
