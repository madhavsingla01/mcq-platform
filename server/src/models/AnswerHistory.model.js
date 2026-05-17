import mongoose from 'mongoose';

const answerHistorySchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      required: true,
      index: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true,
    },
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
    previousAnswer: {
      type: String,
      default: null,
    },
    newAnswer: {
      type: String,
      default: null,
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    stateVersion: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      enum: ['sync', 'answer', 'submit', 'system'],
      default: 'sync',
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

answerHistorySchema.index({ attemptId: 1, questionId: 1, changedAt: -1 });
answerHistorySchema.index({ userId: 1, changedAt: -1 });
answerHistorySchema.index({ clientSessionId: 1, changedAt: -1 });

const AnswerHistory = mongoose.model('AnswerHistory', answerHistorySchema);

export default AnswerHistory;
