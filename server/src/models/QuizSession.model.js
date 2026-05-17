/**
 * QuizSession model — persistent shared quiz sessions.
 * Each quiz can have one shared session with a unique shareCode.
 */

import mongoose from 'mongoose';

const quizSessionSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: [true, 'Quiz ID is required'],
      index: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
    },
    shareCode: {
      type: String,
      required: [true, 'Share code is required'],
      unique: true,
      index: true,
    },
    participantCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for recent public sessions listing
quizSessionSchema.index({ isPublic: 1, createdAt: -1 });

const QuizSession = mongoose.model('QuizSession', quizSessionSchema);
export default QuizSession;
