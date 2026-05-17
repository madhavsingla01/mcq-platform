/**
 * Parser controller — orchestrates file parsing and column mapping.
 */

import Upload from '../models/Upload.model.js';
import { catchAsync, AppError } from '../middleware/error.middleware.js';
import { parseExcel } from '../services/parser/excelParser.js';
import { parseCsv } from '../services/parser/csvParser.js';
import { parseJson } from '../services/parser/jsonParser.js';
import { smartMapColumns } from '../services/parser/smartColumnMapper.js';
import { logger } from '../utils/logger.js';
import {
  recordEvent,
  recordMappingConfig,
} from '../services/activity/activity.service.js';

/**
 * Get the right parser for a file type.
 */
const getParser = (fileType) => {
  switch (fileType) {
    case 'xlsx':
    case 'xls':
      return parseExcel;
    case 'csv':
      return parseCsv;
    case 'json':
      return parseJson;
    default:
      throw new AppError(`Unsupported file type: ${fileType}`, 400);
  }
};

/**
 * POST /api/parser/parse/:uploadId
 * Parse an uploaded file and auto-detect columns.
 */
export const parseFile = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.uploadId);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  upload.status = 'parsing';
  await upload.save();

  try {
    // Parse the file
    const parser = getParser(upload.fileType);
    const { headers, rows, sheetNames } = parser(upload.filePath);

    if (!headers || headers.length === 0) {
      throw new Error('No headers detected');
    }

    if (!rows || rows.length === 0) {
      throw new Error('No data rows found');
    }

    // Smart column detection
    const autoMapping = smartMapColumns(headers, rows);

    // Store parsed data
    upload.parsedData = {
      headers,
      rowCount: rows.length,
      preview: rows.slice(0, 10), // First 10 rows for preview
    };
    upload.autoMapping = autoMapping;
    upload.status = 'parsed';
    upload.parseHistory = [
      ...(Array.isArray(upload.parseHistory) ? upload.parseHistory : []),
      {
        status: 'parsed',
        headers,
        rowCount: rows.length,
        sheetNames: sheetNames || [],
        autoMapping,
        createdAt: new Date(),
      },
    ];
    await upload.save();

    await recordEvent({
      req,
      eventType: 'FILE_PARSED',
      category: 'parser',
      uploadId: upload._id,
      metadata: {
        originalName: upload.originalName,
        headerCount: headers.length,
        rowCount: rows.length,
        sheetNames: sheetNames || [],
        confidence: autoMapping.overallConfidence,
      },
    });

    logger.info(`File parsed: ${upload.originalName} → ${headers.length} cols, ${rows.length} rows`);

    res.json({
      success: true,
      message: 'File parsed successfully',
      data: {
        uploadId: upload._id,
        headers,
        rowCount: rows.length,
        preview: rows.slice(0, 10),
        autoMapping: autoMapping.mapping,
        confidence: autoMapping.overallConfidence, // Return overall confidence to UI
        overallConfidence: autoMapping.overallConfidence,
        sheetNames: sheetNames || [],
      },
    });
  } catch (error) {
    upload.status = 'error';
    upload.errorLog = [...(Array.isArray(upload.errorLog) ? upload.errorLog : []), error.message];
    upload.parseHistory = [
      ...(Array.isArray(upload.parseHistory) ? upload.parseHistory : []),
      {
        status: 'error',
        error: error.message,
        createdAt: new Date(),
      },
    ];
    await upload.save();
    await recordEvent({
      req,
      eventType: 'FILE_PARSE_FAILED',
      category: 'parser',
      uploadId: upload._id,
      metadata: {
        originalName: upload.originalName,
        error: error.message,
      },
    });
    return next(new AppError(`Parsing failed: ${error.message}`, 422));
  }
});

/**
 * POST /api/parser/map/:uploadId
 * Apply manual column mapping.
 */
export const applyMapping = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.uploadId);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  if (!upload.parsedData || !upload.parsedData.headers) {
    return next(new AppError('File has not been parsed yet', 400));
  }

  const { question, options, answer, explanation, serial, media, topic, difficulty } = req.body;

  // Validate required mappings
  if (!question) {
    return next(new AppError('Question column mapping is required', 400));
  }
  if (!options || options.length < 2) {
    return next(new AppError('At least 2 option columns are required', 400));
  }

  upload.columnMapping = {
    question,
    options,
    answer: answer || null,
    explanation: explanation || null,
    serial: serial || null,
    media: media || null,
    topic: topic || null,
    difficulty: difficulty || null,
  };
  upload.status = 'mapped';
  upload.mappingHistory = [
    ...(Array.isArray(upload.mappingHistory) ? upload.mappingHistory : []),
    {
      mappedColumns: upload.columnMapping,
      source: 'manual',
      createdAt: new Date(),
    },
  ];
  await upload.save();
  await recordMappingConfig({
    req,
    upload,
    mappedColumns: upload.columnMapping,
    source: 'manual',
  });

  res.json({
    success: true,
    message: 'Column mapping applied successfully',
    data: {
      uploadId: upload._id,
      columnMapping: upload.columnMapping,
    },
  });
});

/**
 * GET /api/parser/preview/:uploadId
 * Get parsed preview data.
 */
export const getPreview = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.uploadId);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  if (!upload.parsedData) {
    return next(new AppError('File has not been parsed yet', 400));
  }

  res.json({
    success: true,
    data: {
      uploadId: upload._id,
      headers: upload.parsedData.headers,
      rowCount: upload.parsedData.rowCount,
      preview: upload.parsedData.preview,
      autoMapping: upload.autoMapping?.mapping || null,
      confidence: upload.autoMapping?.overallConfidence || null, // Return overall confidence to UI
      columnMapping: upload.columnMapping || null,
      status: upload.status,
    },
  });
});

export default { parseFile, applyMapping, getPreview };
