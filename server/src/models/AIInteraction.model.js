import mongoose from 'mongoose';

const aiInteractionSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
      index: true,
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      default: null,
      index: true,
    },
    interactionType: {
      type: String,
      enum: ['explanation', 'follow_up', 'search'],
      default: 'explanation',
      index: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    response: {
      type: String,
      default: '',
      maxlength: 20000,
    },
    provider: {
      type: String,
      default: 'stub',
      trim: true,
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

aiInteractionSchema.index({ userId: 1, createdAt: -1 });
aiInteractionSchema.index({ quizId: 1, questionId: 1, createdAt: -1 });
aiInteractionSchema.index({ attemptId: 1, createdAt: -1 });

const AIInteraction = mongoose.model('AIInteraction', aiInteractionSchema);

export default AIInteraction;
