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
      required: function() {
        return !this.imageUrl && !this.attachmentUrl;
      },
      trim: true,
      maxlength: [4096, 'Message payload must be at most 4096 characters'],
    },
    imageUrl: {
      type: String,
      default: null,
    },
    attachmentUrl: {
      type: String,
      default: null,
    },
    attachmentName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [255, 'Attachment name must be at most 255 characters'],
    },
    attachmentType: {
      type: String,
      default: '',
      trim: true,
      maxlength: [120, 'Attachment type must be at most 120 characters'],
    },
    attachmentSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
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

// TTL Index — Auto-delete chat messages after 1 hour (3600 seconds)
sessionMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const SessionMessage = mongoose.model('SessionMessage', sessionMessageSchema);
export default SessionMessage;
