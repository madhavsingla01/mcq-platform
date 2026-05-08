/**
 * Question model — individual questions belonging to a quiz.
 * Stored separately from Quiz for scalability.
 */

import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true, // A, B, C, D...
    },
    text: {
      type: String,
      required: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: false }
);

const questionSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    questionNumber: {
      type: Number,
      required: true,
    },
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    options: {
      type: [optionSchema],
      validate: {
        validator: function (v) {
          return v.length >= 2; // At least 2 options
        },
        message: 'A question must have at least 2 options',
      },
    },
    correctAnswer: {
      type: String,
      required: [true, 'Correct answer is required'],
    },
    explanation: {
      type: String,
      trim: true,
      default: '',
    },
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
      default: 'All Levels',
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderIndex: {
      type: Number,
      default: 0,
      index: true,
    },
    media: {
      type: { type: String, enum: ['image', 'audio', 'video', ''] },
      url: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quiz questions
questionSchema.index({ quizId: 1, questionNumber: 1 });
questionSchema.index({ quizId: 1, orderIndex: 1 });
questionSchema.index({ createdAt: -1 });

const Question = mongoose.model('Question', questionSchema);
export default Question;
