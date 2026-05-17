import mongoose from 'mongoose';

const appEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['api', 'socket', 'client', 'system'],
      default: 'api',
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
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      default: null,
      index: true,
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      default: null,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizSession',
      default: null,
      index: true,
    },
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Upload',
      default: null,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SessionMessage',
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    request: {
      method: String,
      path: String,
      ip: String,
      userAgent: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

appEventSchema.index({ userId: 1, createdAt: -1 });
appEventSchema.index({ clientSessionId: 1, createdAt: -1 });
appEventSchema.index({ quizId: 1, createdAt: -1 });
appEventSchema.index({ sessionId: 1, createdAt: -1 });
appEventSchema.index({ attemptId: 1, createdAt: -1 });
appEventSchema.index({ category: 1, eventType: 1, createdAt: -1 });

const AppEvent = mongoose.model('AppEvent', appEventSchema);

export default AppEvent;
