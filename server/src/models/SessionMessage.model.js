/**
 * SessionMessage model — realtime chat messages within a quiz session.
 * Supports cursor-based pagination for chat history.
 */

import mongoose from 'mongoose';

const sessionMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizSession',
      required: [true, 'Session ID is required'],
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message must be at most 1000 characters'],
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    moderation: {
      hidden: { type: Boolean, default: false },
      hiddenAt: { type: Date, default: null },
      hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Primary query index — paginated chat history per session
sessionMessageSchema.index({ sessionId: 1, createdAt: -1 });

const SessionMessage = mongoose.model('SessionMessage', sessionMessageSchema);
export default SessionMessage;
