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
    hash: String,
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    quizCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Quiz title is required'],
      trim: true,
      maxlength: [70, 'Title must be at most 70 characters'],
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
    contentKind: {
      type: String,
      enum: ['quiz', 'form', 'coding', 'upload', 'rating', 'survey', 'universal'],
      default: 'quiz',
      index: true,
    },
    builderMode: {
      type: String,
      trim: true,
      default: 'exam',
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
      timerMode: { type: String, enum: ['none', 'soft', 'strict'], default: 'none' },
      instantFeedback: { type: Boolean, default: false },
      shuffleQuestions: { type: Boolean, default: false },
      shuffleOptions: { type: Boolean, default: false },
      showExplanation: { type: Boolean, default: true },
      allowReview: { type: Boolean, default: true },
    },
    sourceFile: sourceFileSchema,
    fileHash: {
      type: String,
      trim: true,
      default: null,
    },
    columnMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
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
    isChallenge: {
      type: Boolean,
      default: false,
      index: true,
    },
    deadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    accessType: {
      type: String,
      enum: ['public', 'invite_only'],
      default: 'public',
      index: true,
    },
    inviteAccessType: {
      type: String,
      enum: ['invitation', 'approval', null],
      default: null,
    },
    challengeStatus: {
      type: String,
      enum: ['draft', 'active', 'ended'],
      default: 'active',
      index: true,
    },
    totalAttempts: {
      type: Number,
      default: 0,
    },
    avgScore: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    commentCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    bookmarkCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSocialActivityAt: {
      type: Date,
      default: null,
      index: true,
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
quizSchema.index({ fileHash: 1 });
quizSchema.index({ uploader: 1, fileHash: 1 });
quizSchema.index({ uploader: 1, createdAt: -1 });
quizSchema.index({ isPublic: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, category: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, difficulty: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, category: 1, difficulty: 1, createdAt: -1 });
quizSchema.index({ visibility: 1, lastSocialActivityAt: -1, createdAt: -1 });
quizSchema.index({ visibility: 1, likeCount: -1, totalAttempts: -1, createdAt: -1 });
quizSchema.index({ tags: 1 });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ isChallenge: 1, deadlineAt: 1 });
quizSchema.index(
  { title: 'text', description: 'text', category: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, category: 3, description: 1 }, name: 'QuizTextIndex' }
);

const Quiz = mongoose.model('Quiz', quizSchema);
export default Quiz;
