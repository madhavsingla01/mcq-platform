/**
 * JSON parser.
 * Parses .json files into { headers, rows }.
 * Supports array-of-objects format.
 */

import fs from 'fs';
import { cleanCellValue, isEmptyRow } from '../../utils/parserHelpers.js';
import { sanitizeFormulaPrefix } from '../security/formulaSanitizer.service.js';
import { logger } from '../../utils/logger.js';
import env from '../../config/env.js';

/**
 * Parse a JSON file.
 * Supports MCQ question banks and generic tabular JSON.
 * @param {string} filePath - Absolute path to the JSON file
 * @param {Object} options - Parsing options
 * @returns {{ headers: string[], rows: Object[], sheetNames: string[], metadata: Object }}
 */
export const parseJson = (filePath, options = {}) => {
  const { maxRows = env.MAX_IMPORT_ROWS } = options;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedJson = JSON.parse(fileContent);

    // Check if it's an MCQ Question Bank structure
    let questionsCandidate = null;
    let resourceTitle = '';

    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      resourceTitle = parsedJson.title || '';
      const arrayKeys = ['questions', 'data', 'items', 'mcqs', 'records', 'rows'];
      for (const key of arrayKeys) {
        if (Array.isArray(parsedJson[key])) {
          questionsCandidate = parsedJson[key];
          break;
        }
      }
    } else if (Array.isArray(parsedJson)) {
      questionsCandidate = parsedJson;
    }

    const isMcqBank =
      Array.isArray(questionsCandidate) &&
      questionsCandidate.length > 0 &&
      questionsCandidate.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item.prompt || item.question || item.text) &&
          (item.options || item.choices)
      );

    if (isMcqBank) {
      // Process as QuizFocus MCQ Question Bank
      const normalizedQuestions = questionsCandidate.map((q) => {
        const prompt = q.prompt || q.question || q.text || '';
        const rawOptions = q.options || q.choices || [];
        const options = Array.isArray(rawOptions)
          ? rawOptions.map((opt) =>
              typeof opt === 'object' && opt !== null
                ? opt.text || opt.label || opt.option || ''
                : String(opt)
            )
          : [];
        // F8-B4: question with missing explanation defaults safely to 'No explanation provided'
        const explanation = q.explanation || 'No explanation provided';

        let correctAnswer = undefined;
        if (q.correctAnswer !== undefined) {
          correctAnswer = q.correctAnswer;
        } else if (q.answer !== undefined) {
          correctAnswer = q.answer;
        } else if (Array.isArray(rawOptions)) {
          const correctIdx = rawOptions.findIndex(
            (o) => typeof o === 'object' && o !== null && o.isCorrect === true
          );
          if (correctIdx !== -1) {
            correctAnswer = correctIdx;
          }
        }

        return {
          prompt,
          options,
          correctAnswer,
          explanation,
        };
      });

      const totalQuestions = normalizedQuestions.length;

      // Calculate choice distribution & schema validity
      const choiceDistribution = {};
      let validQuestionsCount = 0;
      for (const q of normalizedQuestions) {
        const countStr = String(q.options.length);
        choiceDistribution[countStr] = (choiceDistribution[countStr] || 0) + 1;
        if (q.prompt.trim().length > 0 && q.options.length >= 2) {
          validQuestionsCount++;
        }
      }

      const completeness =
        totalQuestions > 0 ? Number((validQuestionsCount / totalQuestions).toFixed(2)) : 0;
      const schemaValid = totalQuestions > 0 && validQuestionsCount === totalQuestions;

      const metadata = {
        format: 'json',
        resourceType: 'mcq_bank',
        schemaValid,
        totalQuestions,
        questionCount: totalQuestions,
        choiceDistribution,
        completeness,
        questions: normalizedQuestions,
        ...(resourceTitle ? { title: resourceTitle } : {}),
      };

      const headers = ['prompt', 'options', 'correctAnswer', 'explanation'];
      const rows = normalizedQuestions.slice(0, maxRows).map((q) => ({
        prompt: cleanCellValue(q.prompt),
        options: JSON.stringify(q.options),
        correctAnswer: cleanCellValue(q.correctAnswer),
        explanation: cleanCellValue(q.explanation),
      }));

      return {
        headers,
        rows,
        sheetNames: ['Questions'],
        metadata,
      };
    }

    // Generic JSON handling (legacy tabular fallback)
    let data = parsedJson;
    if (!Array.isArray(data)) {
      const arrayKeys = ['data', 'questions', 'items', 'records', 'rows', 'mcqs'];
      for (const key of arrayKeys) {
        if (data[key] && Array.isArray(data[key])) {
          data = data[key];
          break;
        }
      }
    }

    if (!Array.isArray(data)) {
      data = [data];
    }

    if (data.length === 0) {
      return {
        headers: [],
        rows: [],
        sheetNames: ['Sheet1'],
        metadata: { format: 'json', totalRows: 0, totalCols: 0, headers: [] },
      };
    }

    // Collect all unique keys from all objects
    const headerSet = new Set();
    data.forEach((item) => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach((key) => headerSet.add(key));
      }
    });

    const headers = Array.from(headerSet).map((h) => sanitizeFormulaPrefix(h));

    // Clean and normalize rows
    const rows = data
      .slice(0, maxRows)
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const cleaned = {};
        headers.forEach((header) => {
          const value = item[header];
          if (typeof value === 'object' && value !== null) {
            cleaned[header] = JSON.stringify(value);
          } else {
            cleaned[header] = cleanCellValue(value);
          }
        });
        return cleaned;
      })
      .filter((row) => !isEmptyRow(row));

    const metadata = {
      format: 'json',
      totalRows: rows.length,
      totalCols: headers.length,
      headers,
    };

    logger.debug(`JSON parsed: ${headers.length} columns, ${rows.length} rows`);

    return { headers, rows, sheetNames: ['Sheet1'], metadata };
  } catch (error) {
    logger.error('JSON parsing error:', error.message);
    throw new Error(`Failed to parse JSON file: ${error.message}`);
  }
};

export default { parseJson };
