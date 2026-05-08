/**
 * Quiz generator service.
 * Converts mapped upload data into Quiz + Question documents.
 */

import Quiz from '../../models/Quiz.model.js';
import Question from '../../models/Question.model.js';
import Upload from '../../models/Upload.model.js';
import { extractOptions } from '../parser/optionExtractor.js';
import { normalizeAnswer } from '../parser/answerDetector.js';
import { generateShareCode } from '../../utils/generateId.js';
import { logger } from '../../utils/logger.js';

/**
 * Generate a quiz from a mapped upload.
 * @param {string} uploadId - Upload document ID
 * @param {Object} options - Quiz options (title, settings)
 * @returns {Object} Created quiz
 */
export const generateQuiz = async (uploadId, options = {}) => {
  const upload = await Upload.findById(uploadId);

  if (!upload) throw new Error('Upload not found');
  if (upload.status !== 'mapped') throw new Error('Upload must be mapped before quiz generation');

  const { columnMapping, parsedData } = upload;
  
  // Re-parse full file to get all rows
  let rows = [];
  if (upload.fileType === 'xlsx' || upload.fileType === 'xls') {
    const { parseExcel } = await import('../parser/excelParser.js');
    const res = parseExcel(upload.filePath);
    rows = res.rows;
  } else if (upload.fileType === 'csv') {
    const { parseCsv } = await import('../parser/csvParser.js');
    const res = await parseCsv(upload.filePath);
    rows = res.rows;
  } else if (upload.fileType === 'json') {
    const { parseJson } = await import('../parser/jsonParser.js');
    const res = await parseJson(upload.filePath);
    rows = res.rows;
  } else {
    throw new Error(`Unsupported file type: ${upload.fileType}`);
  }

  // Build questions and error report
  const questions = [];
  const errorReport = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // 1-indexed

    // 1. Extract question text
    const questionText = row[columnMapping.question];
    if (!questionText || String(questionText).trim() === '') {
      errorReport.push({ row: rowNum, error: 'Missing or empty question text' });
      continue;
    }

    // 2. Extract options
    const optionData = extractOptions(row, columnMapping.options);
    if (optionData.length < 2) {
      errorReport.push({ row: rowNum, error: 'Less than 2 valid options found' });
      continue;
    }

    // 3. Extract and normalize answer
    let correctAnswer = [];
    if (columnMapping.answer) {
      const normalizedAns = normalizeAnswer(row[columnMapping.answer], optionData);
      if (normalizedAns) {
         // Support multiple answers in future, for MVP it's single
         correctAnswer = [normalizedAns];
      } else {
         errorReport.push({ row: rowNum, error: 'Correct answer could not be mapped to any option' });
         continue; // Strict validation: answer must exist
      }
    } else {
      errorReport.push({ row: rowNum, error: 'Missing answer mapping' });
      continue;
    }

    // 4. Extract explanation, topic, difficulty
    let explanation = '';
    if (columnMapping.explanation) {
      explanation = String(row[columnMapping.explanation] || '').trim();
    }

    let tags = [];
    if (columnMapping.topic && row[columnMapping.topic]) {
      // Split by comma if multiple tags exist in one column
      tags = String(row[columnMapping.topic]).split(',').map(t => t.trim()).filter(Boolean);
    }

    let difficulty = 'medium'; // Default
    if (columnMapping.difficulty && row[columnMapping.difficulty]) {
      const parsedDiff = String(row[columnMapping.difficulty]).toLowerCase().trim();
      if (['easy', 'medium', 'hard'].includes(parsedDiff)) {
        difficulty = parsedDiff;
      }
    }

    // Add standardized question
    questions.push({
      questionNumber: questions.length + 1,
      questionText: String(questionText).trim(),
      type: 'single', // MVP default
      options: optionData,
      correctAnswer,
      explanation,
      media: [],
      tags,
      difficulty,
      metadata: columnMapping.serial ? { serial: row[columnMapping.serial] } : {},
    });
  }

  if (questions.length === 0) {
    throw new Error('No valid questions could be extracted from the file');
  }

  // Create Quiz document
  const quiz = await Quiz.create({
    title: options.title || `Quiz from ${upload.originalName}`,
    description: options.description || '',
    uploader: upload.userId || null,
    questionCount: questions.length,
    settings: options.settings || {},
    sourceFile: {
      name: upload.originalName,
      type: upload.fileType,
      size: upload.fileSize,
    },
    columnMapping: columnMapping,
    shareCode: generateShareCode(),
  });

  // Bulk insert questions
  const questionDocs = questions.map((q) => ({
    ...q,
    quizId: quiz._id,
  }));

  await Question.insertMany(questionDocs);

  // Update upload status
  upload.status = 'generated';
  upload.quizId = quiz._id;
  upload.errorLog = errorReport;
  await upload.save();

  logger.info(`Quiz generated: "${quiz.title}" with ${questions.length} questions (${errorReport.length} validation errors)`);

  return { quiz, questionCount: questions.length, errors: errorReport };
};

// Removed getParserForType helper since it's inline now

export default { generateQuiz };
