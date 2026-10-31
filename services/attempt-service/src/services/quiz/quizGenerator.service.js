/**
 * Quiz generator service.
 * Converts mapped upload data into Quiz + Question documents.
 * Includes SHA-256 fingerprint generation, duplicate checking, and concurrency locking.
 */

import Quiz from '../../models/Quiz.model.js';
import Question from '../../models/Question.model.js';
import Upload from '../../models/Upload.model.js';
import { extractOptions } from '../parser/optionExtractor.js';
import { normalizeAnswer } from '../parser/answerDetector.js';
import { generateShareCode } from '../../utils/generateId.js';
import { logger } from '../../utils/logger.js';
import { ParserRegistry } from '../parser/strategies/ParserRegistry.js';
import { calculateFileHash, findDuplicateQuiz, withGenerationLock } from '../upload/fileHash.service.js';

/**
 * Generate a quiz from a mapped upload.
 * @param {string} uploadId - Upload document ID
 * @param {Object} options - Quiz options (title, settings, forceGenerate, allowDuplicate)
 * @returns {Promise<Object>} Created or existing quiz result
 */
export const generateQuiz = async (uploadId, options = {}) => {
  const upload = await Upload.findById(uploadId);

  if (!upload) throw new Error('Upload not found');
  if (upload.status !== 'mapped') throw new Error('Upload must be mapped before quiz generation');

  // Compute or reuse SHA-256 fingerprint
  const fileHash = upload.fileHash || (await calculateFileHash(upload.filePath));
  if (!upload.fileHash) {
    upload.fileHash = fileHash;
    await upload.save();
  }

  // Duplicate check before quiz generation
  const shouldBypassDuplicate = Boolean(options.forceGenerate || options.allowDuplicate);
  if (!shouldBypassDuplicate) {
    const existingQuiz = await findDuplicateQuiz({
      fileHash,
      uploaderId: upload.userId || options.userId || null,
    });

    if (existingQuiz) {
      logger.info(`Duplicate quiz found for fileHash ${fileHash}: Quiz "${existingQuiz.title}" [${existingQuiz._id}]`);
      return {
        quiz: existingQuiz,
        isDuplicate: true,
        existingQuizId: existingQuiz._id,
        questionCount: existingQuiz.questionCount,
        errors: [],
      };
    }
  }

  // Execute with concurrency lock to handle simultaneous uploads safely
  return withGenerationLock(shouldBypassDuplicate ? null : fileHash, async () => {
    const { columnMapping } = upload;

    // Re-parse full file to get all rows via extensible ParserRegistry (OCP)
    const parseResult = await ParserRegistry.parse(upload.fileType, upload.filePath);
    const rows = parseResult.rows || [];

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
          correctAnswer = [normalizedAns];
        } else {
          errorReport.push({ row: rowNum, error: 'Correct answer could not be mapped to any option' });
          continue;
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
        tags = String(row[columnMapping.topic]).split(',').map((t) => t.trim()).filter(Boolean);
      }

      let difficulty = 'medium';
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
        type: 'single',
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

    // Create Quiz document with fileHash
    const quiz = await Quiz.create({
      title: String(options.title || `Quiz from ${upload.originalName}`).trim().slice(0, 70),
      description: options.description || '',
      uploader: upload.userId || options.userId || null,
      questionCount: questions.length,
      settings: options.settings || {},
      sourceFile: {
        name: upload.originalName,
        type: upload.fileType,
        size: upload.fileSize,
        hash: fileHash,
      },
      fileHash,
      columnMapping,
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

    logger.info(`Quiz generated: "${quiz.title}" with ${questions.length} questions [hash: ${fileHash.slice(0, 8)}...]`);

    return { quiz, questionCount: questions.length, errors: errorReport, isDuplicate: false };
  });
};

export default { generateQuiz };
