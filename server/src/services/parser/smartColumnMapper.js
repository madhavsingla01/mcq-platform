/**
 * Smart Column Mapper — Core intelligence module.
 *
 * Automatically detects which columns correspond to:
 *   - Question text
 *   - Options (A, B, C, D, ...)
 *   - Correct answer
 *   - Explanation
 *   - Serial number
 *   - Media
 *
 * Uses keyword matching, regex patterns, and content analysis.
 */

import { normalizeHeader } from '../../utils/normalizeColumns.js';
import { getColumnStats } from '../../utils/parserHelpers.js';
import { logger } from '../../utils/logger.js';

// ===== KEYWORD DICTIONARIES =====

const QUESTION_KEYWORDS = [
  'question', 'ques', 'q', 'mcq', 'problem', 'stem', 'prompt',
  'query', 'text', 'statement', 'ask',
];

const OPTION_KEYWORDS = [
  'option', 'choice', 'opt', 'alternative', 'ans_option',
];

const OPTION_LETTER_PATTERNS = [
  /^[a-f]$/,                    // a, b, c, d, e, f
  /^option[_\s]?[a-f]$/,       // option_a, optiona
  /^opt[_\s]?[a-f]$/,          // opt_a, opta
  /^choice[_\s]?[a-f]$/,       // choice_a, choicea
  /^answer[_\s]?[a-f]$/,       // answer_a
  /^[a-f][_\s]?option$/,       // a_option
];

const OPTION_NUMBER_PATTERNS = [
  /^option[_\s]?\d$/,          // option1, option_1
  /^opt[_\s]?\d$/,             // opt1, opt_1
  /^choice[_\s]?\d$/,          // choice1, choice_1
  /^alternative[_\s]?\d$/,     // alternative1
];

const ANSWER_KEYWORDS = [
  'answer', 'ans', 'correct', 'solution', 'right_answer',
  'correct_answer', 'key', 'right', 'correct_option',
  'correct_ans', 'right_ans',
];

const EXPLANATION_KEYWORDS = [
  'explanation', 'explain', 'reason', 'rationale', 'hint',
  'solution_text', 'detail', 'note', 'description', 'why',
];

const SERIAL_KEYWORDS = [
  'sno', 'sr', 'id', 'num', 'index', 'sl', 'serial',
  's_no', 'sr_no', 'sl_no', 'number', 'row', 'no',
  'question_no', 'q_no', 'qno',
];

const MEDIA_KEYWORDS = [
  'image', 'img', 'audio', 'video', 'media', 'url',
  'picture', 'photo', 'link', 'file', 'attachment',
];

// ===== SCORING FUNCTIONS =====

/**
 * Score a normalized header against a set of keywords.
 * Returns 0-100 confidence score.
 */
const scoreKeyword = (normalized, keywords) => {
  // Exact match
  if (keywords.includes(normalized)) return 100;

  // Partial match — header contains keyword
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) return 80;
    if (keyword.includes(normalized) && normalized.length >= 2) return 60;
  }

  return 0;
};

/**
 * Score a header for being an option column.
 */
const scoreOption = (normalized) => {
  // Check letter patterns (a, b, c, d)
  for (const pattern of OPTION_LETTER_PATTERNS) {
    if (pattern.test(normalized)) return 95;
  }

  // Check number patterns (option1, choice_2)
  for (const pattern of OPTION_NUMBER_PATTERNS) {
    if (pattern.test(normalized)) return 90;
  }

  // Keyword match
  return scoreKeyword(normalized, OPTION_KEYWORDS);
};

/**
 * Extract option order from header (for sorting).
 * Returns letter index (a=0, b=1) or number.
 */
const getOptionOrder = (normalized) => {
  // Extract letter
  const letterMatch = normalized.match(/[a-f]/);
  if (letterMatch) return letterMatch[0].charCodeAt(0) - 97;

  // Extract number
  const numberMatch = normalized.match(/\d/);
  if (numberMatch) return parseInt(numberMatch[0]) - 1;

  return 99; // Unknown order
};

// ===== MAIN MAPPER =====

/**
 * Analyze columns and suggest mapping.
 * @param {string[]} headers - Original column headers
 * @param {Object[]} rows - Data rows (first 20 used for analysis)
 * @returns {{ mapping: Object, confidence: Object, suggestions: Array }}
 */
export const smartMapColumns = (headers, rows) => {
  const sampleRows = rows.slice(0, 20);
  const scores = {};
  const mapping = {
    question: null,
    options: [],
    answer: null,
    explanation: null,
    serial: null,
    media: null,
  };
  const confidence = {};

  // Score each header
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    const stats = getColumnStats(sampleRows, header);

    scores[header] = {
      normalized,
      question: scoreKeyword(normalized, QUESTION_KEYWORDS),
      option: scoreOption(normalized),
      answer: scoreKeyword(normalized, ANSWER_KEYWORDS),
      explanation: scoreKeyword(normalized, EXPLANATION_KEYWORDS),
      serial: scoreKeyword(normalized, SERIAL_KEYWORDS),
      media: scoreKeyword(normalized, MEDIA_KEYWORDS),
      stats,
    };

    // Content-based boosting
    // Long text → likely question
    if (stats.avgLength > 50 && stats.types.string > stats.types.number) {
      scores[header].question += 20;
    }

    // Short text (1-2 chars) → likely serial or answer
    if (stats.avgLength <= 2 && stats.types.string > 0) {
      scores[header].answer += 10;
      scores[header].serial += 10;
    }

    // Mostly numbers, short → likely serial
    if (stats.types.number > stats.types.string && stats.avgLength <= 5) {
      scores[header].serial += 30;
    }

    // Medium-length text → likely option
    if (stats.avgLength > 5 && stats.avgLength < 100) {
      scores[header].option += 5;
    }
  });

  // ===== RESOLVE MAPPINGS =====

  // 1. Find question column (highest question score)
  let bestQuestion = { header: null, score: 0 };
  for (const [header, s] of Object.entries(scores)) {
    if (s.question > bestQuestion.score) {
      bestQuestion = { header, score: s.question };
    }
  }
  if (bestQuestion.score >= 40) {
    mapping.question = bestQuestion.header;
    confidence.question = bestQuestion.score;
  }

  // 2. Find option columns (all with option score >= 60)
  const optionCandidates = Object.entries(scores)
    .filter(([h, s]) => s.option >= 60 && h !== mapping.question)
    .sort(([, a], [, b]) => {
      const orderA = getOptionOrder(a.normalized);
      const orderB = getOptionOrder(b.normalized);
      return orderA - orderB;
    })
    .map(([h, s]) => ({ header: h, score: s.option }));

  mapping.options = optionCandidates.map((c) => c.header);
  confidence.options = optionCandidates.length > 0
    ? Math.round(optionCandidates.reduce((sum, c) => sum + c.score, 0) / optionCandidates.length)
    : 0;

  // 3. Find answer column
  let bestAnswer = { header: null, score: 0 };
  for (const [header, s] of Object.entries(scores)) {
    if (
      s.answer > bestAnswer.score &&
      header !== mapping.question &&
      !mapping.options.includes(header)
    ) {
      bestAnswer = { header, score: s.answer };
    }
  }
  if (bestAnswer.score >= 40) {
    mapping.answer = bestAnswer.header;
    confidence.answer = bestAnswer.score;
  }

  // 4. Find explanation column
  let bestExplanation = { header: null, score: 0 };
  for (const [header, s] of Object.entries(scores)) {
    if (
      s.explanation > bestExplanation.score &&
      header !== mapping.question &&
      !mapping.options.includes(header) &&
      header !== mapping.answer
    ) {
      bestExplanation = { header, score: s.explanation };
    }
  }
  if (bestExplanation.score >= 40) {
    mapping.explanation = bestExplanation.header;
    confidence.explanation = bestExplanation.score;
  }

  // 5. Find serial column
  let bestSerial = { header: null, score: 0 };
  for (const [header, s] of Object.entries(scores)) {
    if (
      s.serial > bestSerial.score &&
      header !== mapping.question &&
      !mapping.options.includes(header) &&
      header !== mapping.answer &&
      header !== mapping.explanation
    ) {
      bestSerial = { header, score: s.serial };
    }
  }
  if (bestSerial.score >= 40) {
    mapping.serial = bestSerial.header;
    confidence.serial = bestSerial.score;
  }

  // 6. Find media column
  let bestMedia = { header: null, score: 0 };
  for (const [header, s] of Object.entries(scores)) {
    if (
      s.media > bestMedia.score &&
      header !== mapping.question &&
      !mapping.options.includes(header) &&
      header !== mapping.answer &&
      header !== mapping.explanation &&
      header !== mapping.serial
    ) {
      bestMedia = { header, score: s.media };
    }
  }
  if (bestMedia.score >= 40) {
    mapping.media = bestMedia.header;
    confidence.media = bestMedia.score;
  }

  // ===== FALLBACK: Content analysis if no question detected =====
  if (!mapping.question) {
    // Pick the column with the longest average text content
    let longestCol = { header: null, avgLength: 0 };
    for (const [header, s] of Object.entries(scores)) {
      if (!mapping.options.includes(header) && header !== mapping.answer) {
        if (s.stats.avgLength > longestCol.avgLength) {
          longestCol = { header, avgLength: s.stats.avgLength };
        }
      }
    }
    if (longestCol.header) {
      mapping.question = longestCol.header;
      confidence.question = 30; // Low confidence — content-based guess
    }
  }

  // Generate suggestions for unmapped columns
  const mappedHeaders = new Set([
    mapping.question,
    ...mapping.options,
    mapping.answer,
    mapping.explanation,
    mapping.serial,
    mapping.media,
  ].filter(Boolean));

  const suggestions = headers
    .filter((h) => !mappedHeaders.has(h))
    .map((h) => ({
      header: h,
      scores: scores[h] || {},
    }));

  const overallConfidence = calculateOverallConfidence(mapping, confidence);

  logger.debug('Smart mapping result:', {
    mapping,
    confidence,
    overallConfidence,
    unmapped: suggestions.length,
  });

  return { mapping, confidence, overallConfidence, suggestions, scores };
};

/**
 * Calculate overall mapping confidence.
 */
const calculateOverallConfidence = (mapping, confidence) => {
  let total = 0;
  let count = 0;

  if (mapping.question) { total += confidence.question || 0; count++; }
  if (mapping.options.length > 0) { total += confidence.options || 0; count++; }
  if (mapping.answer) { total += confidence.answer || 0; count++; }

  // Bonus for having all core fields
  if (mapping.question && mapping.options.length >= 2 && mapping.answer) {
    total += 20;
  }

  return count > 0 ? Math.min(100, Math.round(total / count)) : 0;
};

export default { smartMapColumns };
