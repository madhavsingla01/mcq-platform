import mongoose from 'mongoose';

const attemptFlagSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    selectedAnswer: {
      type: String,
      default: null,
    },
    selectedOptionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    correctOptionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    marksAwarded: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockSource: {
      type: String,
      enum: ['quick_mode', 'submit', 'sync', null],
      default: null,
    },
    timeTaken: {
      type: Number,
      default: 0,
    },
    timeTakenMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    visitedAt: {
      type: Date,
      default: null,
    },
    firstVisitedAt: {
      type: Date,
      default: null,
    },
    lastVisitedAt: {
      type: Date,
      default: null,
    },
    visitTimestamps: {
      type: [Date],
      default: [],
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    submissionTimestamps: {
      type: [Date],
      default: [],
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lastClientUpdatedAt: {
      type: Date,
      default: null,
    },
    isSkipped: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const attemptAnalyticsSchema = new mongoose.Schema(
  {
    answeredCount: {
      type: Number,
      default: 0,
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    wrongCount: {
      type: Number,
      default: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
    },
    averageTimePerQuestionMs: {
      type: Number,
      default: 0,
    },
    timeSpentCorrectMs: {
      type: Number,
      default: 0,
    },
    timeSpentWrongMs: {
      type: Number,
      default: 0,
    },
    fastestSolvedQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    fastestSolvedTimeMs: {
      type: Number,
      default: 0,
    },
    slowestSolvedQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    slowestSolvedTimeMs: {
      type: Number,
      default: 0,
    },
    responseSpeed: {
      averageAnsweredQuestionMs: { type: Number, default: 0 },
      averageCorrectAnswerMs: { type: Number, default: 0 },
      averageWrongAnswerMs: { type: Number, default: 0 },
      answersPerMinute: { type: Number, default: 0 },
      correctAnswersPerMinute: { type: Number, default: 0 },
      speedBand: {
        type: String,
        enum: ['instant', 'fast', 'steady', 'deliberate', 'unclassified'],
        default: 'unclassified',
      },
    },
    completionEfficiency: {
      completionRate: { type: Number, default: 0 },
      accuracyOnAnswered: { type: Number, default: 0 },
      efficiencyScore: { type: Number, default: 0 },
      answeredPerMinute: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const suspiciousActivitySchema = new mongoose.Schema(
  {
    timeMismatchCount: {
      type: Number,
      default: 0,
    },
    answerEditRejectedCount: {
      type: Number,
      default: 0,
    },
    flags: {
      type: [attemptFlagSchema],
      default: [],
    },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sessionId: {
      type: String,
      default: null,
      trim: true,
    },
    answers: {
      type: [answerSchema],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
    },
    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    wrongCount: {
      type: Number,
      default: 0,
    },
    unansweredCount: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    totalTime: {
      type: Number,
      default: 0,
    },
    totalTimeMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    isQuickMode: {
      type: Boolean,
      default: false,
    },
    instantFeedback: {
      type: Boolean,
      default: false,
    },
    timerMode: {
      type: String,
      enum: ['none', 'soft', 'strict'],
      default: 'none',
    },
    deadlineAt: {
      type: Date,
      default: null,
    },
    allowedDurationMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    syncStatus: {
      type: String,
      enum: ['pending', 'synced', 'failed'],
      default: 'pending',
      index: true,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastActiveQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    progress: {
      currentQuestionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        default: null,
      },
      answeredCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      markedForReviewCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalQuestions: {
        type: Number,
        default: 0,
        min: 0,
      },
      percentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    markedForReview: {
      type: [{
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        markedAt: {
          type: Date,
          default: Date.now,
        },
        unmarkedAt: {
          type: Date,
          default: null,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      }],
      default: [],
    },
    syncVersion: {
      type: Number,
      default: 0,
    },
    lastClientSyncAt: {
      type: Date,
      default: null,
    },
    lastServerSyncAt: {
      type: Date,
      default: null,
    },
    analytics: {
      type: attemptAnalyticsSchema,
      default: () => ({}),
    },
    suspiciousActivity: {
      type: suspiciousActivitySchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

attemptSchema.index({ quizId: 1, userId: 1, status: 1, createdAt: -1 });
attemptSchema.index({ quizId: 1, sessionId: 1, status: 1, createdAt: -1 });
attemptSchema.index({ quizId: 1, completedAt: -1 });
attemptSchema.index({ userId: 1, createdAt: -1 });
attemptSchema.index({ userId: 1, completedAt: -1 });
attemptSchema.index({ sessionId: 1, createdAt: -1 });
attemptSchema.index({ 'answers.questionId': 1 });
attemptSchema.index({ 'markedForReview.questionId': 1 });
attemptSchema.index({ 'progress.currentQuestionId': 1 });
attemptSchema.index({ createdAt: -1 });
attemptSchema.index({ completedAt: -1 });

const Attempt = mongoose.model('Attempt', attemptSchema);

export default Attempt;
