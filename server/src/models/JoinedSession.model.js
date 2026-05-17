import mongoose from 'mongoose';

const joinedSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizSession',
      required: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastOpenedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate joins
joinedSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
// Optimize dashboard queries
joinedSessionSchema.index({ userId: 1, lastOpenedAt: -1 });

const JoinedSession = mongoose.model('JoinedSession', joinedSessionSchema);
export default JoinedSession;
