import mongoose from 'mongoose';

const recentQuizSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientSessionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      default: null,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizSession',
      default: null,
      index: true,
    },
    lastVisitedQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    progress: {
      answeredCount: { type: Number, default: 0 },
      totalQuestions: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      status: { type: String, default: 'opened' },
    },
    lastOpenedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

recentQuizSchema.index(
  { userId: 1, quizId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
recentQuizSchema.index(
  { clientSessionId: 1, quizId: 1 },
  { unique: true, partialFilterExpression: { clientSessionId: { $type: 'string' } } }
);
recentQuizSchema.index({ userId: 1, lastOpenedAt: -1 });
recentQuizSchema.index({ clientSessionId: 1, lastOpenedAt: -1 });

const RecentQuiz = mongoose.model('RecentQuiz', recentQuizSchema);

export default RecentQuiz;
