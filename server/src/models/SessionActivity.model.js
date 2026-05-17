import mongoose from 'mongoose';

const sessionActivitySchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizSession',
      required: true,
      index: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

sessionActivitySchema.index({ sessionId: 1, createdAt: -1 });
sessionActivitySchema.index({ quizId: 1, createdAt: -1 });
sessionActivitySchema.index({ userId: 1, createdAt: -1 });

const SessionActivity = mongoose.model('SessionActivity', sessionActivitySchema);

export default SessionActivity;
