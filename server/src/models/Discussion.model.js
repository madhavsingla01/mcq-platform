/**
 * Discussion model — community discussions on questions.
 * Future-ready, not exposed in MVP API.
 */

import mongoose from 'mongoose';

const discussionSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Discussion content is required'],
      trim: true,
      maxlength: [2000, 'Content must be at most 2000 characters'],
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Discussion',
      default: null,
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    upvotedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    isReported: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
discussionSchema.index({ questionId: 1, createdAt: -1 });
discussionSchema.index({ userId: 1 });
discussionSchema.index({ parentId: 1 });

const Discussion = mongoose.model('Discussion', discussionSchema);
export default Discussion;
