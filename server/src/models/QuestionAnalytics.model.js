import mongoose from 'mongoose';

const questionAnalyticsSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      unique: true,
      index: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    totalAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    correctAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    wrongAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    skippedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    avgTimeTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
    accuracyPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    wrongAnswerFrequency: {
      type: Map,
      of: Number,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

questionAnalyticsSchema.index({ quizId: 1, accuracyPercentage: 1 });
questionAnalyticsSchema.index({ quizId: 1, skippedAttempts: -1 });
questionAnalyticsSchema.index({ updatedAt: -1 });

const QuestionAnalytics = mongoose.model('QuestionAnalytics', questionAnalyticsSchema);

export default QuestionAnalytics;
