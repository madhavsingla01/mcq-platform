/**
 * Quiz model — metadata for a generated quiz.
 * Questions are stored separately in the Question collection.
 */

import mongoose from 'mongoose';

const sourceFileSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    size: Number,
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Quiz title is required'],
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
      default: 'All Levels',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be at most 1000 characters'],
      default: '',
    },
    thumbnail: {
      type: String,
      trim: true,
      default: '',
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'unlisted'],
      default: 'private',
      index: true,
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for guest uploads
    },
    questionCount: {
      type: Number,
      required: true,
      min: 1,
    },
    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    quickModeEnabled: {
      type: Boolean,
      default: true,
    },
    settings: {
      timeLimit: { type: Number, default: 0 }, // 0 = no time limit, value in minutes
      shuffleQuestions: { type: Boolean, default: false },
      shuffleOptions: { type: Boolean, default: false },
      showExplanation: { type: Boolean, default: true },
      allowReview: { type: Boolean, default: true },
    },
    sourceFile: sourceFileSchema,
    columnMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    shareCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    totalAttempts: {
      type: Number,
      default: 0,
    },
    avgScore: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

quizSchema.pre('validate', function normalizeQuizVisibility(next) {
  if (this.isModified('isPublic') && !this.isModified('visibility')) {
    this.visibility = this.isPublic ? 'public' : 'private';
  }

  this.isPublic = this.visibility === 'public';
  next();
});

// Indexes
quizSchema.index({ uploader: 1, createdAt: -1 });
// quizSchema.index({ shareCode: 1 });
quizSchema.index({ isPublic: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, createdAt: -1 });
quizSchema.index({ tags: 1 });
quizSchema.index({ createdAt: -1 });

const Quiz = mongoose.model('Quiz', quizSchema);
export default Quiz;
