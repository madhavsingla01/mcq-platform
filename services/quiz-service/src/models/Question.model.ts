/**
 * Question model — individual questions belonging to a quiz.
 * Stored separately from Quiz for scalability.
 */

import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  {
    optionId: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
    accessibilityMedia: { type: [mongoose.Schema.Types.Mixed], default: [] },
    label: {
      type: String,
      required: true, // A, B, C, D...
    },
    text: {
      type: String,
      required: function (this: { accessibilityMedia?: readonly unknown[] }) { return !this.accessibilityMedia?.length; },
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
    accessibilityMedia: { type: [mongoose.Schema.Types.Mixed], default: [] },
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
      required: function (this: { accessibilityMedia?: readonly unknown[] }) { return !this.accessibilityMedia?.length; },
      trim: true,
    },
    questionType: {
      type: String,
      enum: ['short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'file_upload', 'linear_scale', 'rating', 'multiple_choice_grid', 'tick_box_grid', 'date', 'time', 'code', 'coding_link'],
      default: 'multiple_choice',
    },
    options: {
      type: [optionSchema],
      validate: {
        validator: function (this: { questionType: string }, v: readonly unknown[] | undefined) {
          if (['multiple_choice', 'checkboxes', 'dropdown'].includes(this.questionType)) {
            return v && v.length >= 2;
          }
          return true;
        },
        message: 'This question type must have at least 2 options',
      },
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
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
    grid: {
      rows: [{ id: String, text: String }],
      columns: [{ id: String, text: String }]
    },
    settings: {
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
