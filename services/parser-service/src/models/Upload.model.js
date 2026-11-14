/**
 * Upload model — tracks file uploads and their parsing status.
 */

import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    guestSessionId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['xlsx', 'xls', 'csv', 'json', 'pdf', 'zip', 'bundle'],
      required: true,
    },
    mimeType: {
      type: String,
      default: 'application/octet-stream',
    },
    fileSize: {
      type: Number,
      required: true,
    },
    originalFileSize: {
      type: Number,
      default: null,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileHash: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    purpose: {
      type: String,
      enum: ['quiz-dataset'],
      default: 'quiz-dataset',
      required: true,
    },
    sanitizationStatus: {
      type: String,
      enum: ['validated', 'warning'],
      default: 'validated',
      required: true,
    },
    status: {
      type: String,
      enum: ['uploaded', 'parsing', 'parsed', 'mapped', 'generated', 'error'],
      default: 'uploaded',
    },
    parsedData: {
      headers: [String],
      rowCount: Number,
      preview: [mongoose.Schema.Types.Mixed], // First 5 rows
    },
    parseHistory: {
      type: [{
        status: {
          type: String,
          enum: ['parsed', 'error'],
          required: true,
        },
        headers: {
          type: [String],
          default: [],
        },
        rowCount: {
          type: Number,
          default: 0,
        },
        sheetNames: {
          type: [String],
          default: [],
        },
        autoMapping: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
        error: {
          type: String,
          default: '',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      }],
      default: [],
    },
    columnMapping: {
      question: String,
      options: [String],
      answer: String,
      explanation: String,
      serial: String,
      media: String,
      topic: String,
      difficulty: String,
    },
    autoMapping: {
      type: mongoose.Schema.Types.Mixed, // Auto-detected mapping with confidence
      default: null,
    },
    mappingHistory: {
      type: [{
        mappedColumns: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        source: {
          type: String,
          enum: ['auto', 'manual', 'import'],
          default: 'manual',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      }],
      default: [],
    },
    errorLog: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index
uploadSchema.index({ userId: 1, createdAt: -1 });
uploadSchema.index({ status: 1, updatedAt: -1 });
uploadSchema.index({ userId: 1, fileHash: 1 });

const Upload = mongoose.model('Upload', uploadSchema);
export default Upload;
