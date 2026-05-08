/**
 * Answer detection and matching utilities.
 */

/**
 * Detect the format of an answer value.
 * @param {string} answer - Raw answer value
 * @returns {{ type: string, value: string }}
 */
export const detectAnswerFormat = (answer) => {
  if (answer === null || answer === undefined) {
    return { type: 'unknown', value: '' };
  }

  const str = String(answer).trim();

  // Single letter: A, B, C, D, etc.
  if (/^[A-Za-z]$/.test(str)) {
    return { type: 'letter', value: str.toUpperCase() };
  }

  // Number: 1, 2, 3, 4
  if (/^\d$/.test(str)) {
    return { type: 'number', value: str };
  }

  // Boolean
  if (/^(true|false|yes|no)$/i.test(str)) {
    return { type: 'boolean', value: str.toLowerCase() };
  }

  // Full text — likely the answer text itself
  return { type: 'text', value: str };
};

/**
 * Match an answer value to the correct option index.
 * @param {string} answer - The answer value
 * @param {Array<{label: string, text: string}>} options - Quiz options
 * @returns {number} Index of matched option, or -1
 */
export const matchAnswerToOption = (answer, options) => {
  if (!answer || !options || options.length === 0) return -1;

  const { type, value } = detectAnswerFormat(answer);

  switch (type) {
    case 'letter': {
      // A=0, B=1, C=2, D=3
      const index = value.charCodeAt(0) - 65;
      return index >= 0 && index < options.length ? index : -1;
    }
    case 'number': {
      // 1=0, 2=1, 3=2, 4=3
      const index = parseInt(value) - 1;
      return index >= 0 && index < options.length ? index : -1;
    }
    case 'boolean': {
      const boolStr = value === 'true' || value === 'yes' ? 'true' : 'false';
      return options.findIndex(
        (opt) => opt.text.toLowerCase().trim() === boolStr
      );
    }
    case 'text': {
      // Exact match first
      let index = options.findIndex(
        (opt) => opt.text.toLowerCase().trim() === value.toLowerCase()
      );
      if (index !== -1) return index;

      // Partial match — answer contained in option or vice versa
      index = options.findIndex(
        (opt) =>
          opt.text.toLowerCase().includes(value.toLowerCase()) ||
          value.toLowerCase().includes(opt.text.toLowerCase())
      );
      return index;
    }
    default:
      return -1;
  }
};

export default { detectAnswerFormat, matchAnswerToOption };
