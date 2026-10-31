import mongoose from 'mongoose';

const moderationReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reporterName: {
      type: String,
      default: 'Anonymous',
    },
    targetType: {
      type: String,
      required: true,
      enum: ['quiz', 'challenge', 'user', 'comment', 'question'],
      index: true,
    },
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    targetTitle: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      required: true,
      enum: [
        'spam',
        'harassment',
        'inappropriate',
        'impersonation',
        'cheating',
        'copyright',
        'misinformation',
        'other',
      ],
      default: 'other',
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'in_review', 'action_taken', 'dismissed', 'appealed', 'closed'],
      default: 'pending',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    resolutionAction: {
      type: String,
      enum: ['none', 'restricted', 'suspended', 'dismissed', 'warned'],
      default: 'none',
    },
    resolutionNotes: {
      type: String,
      default: '',
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    resolvedByName: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const ModerationReport = mongoose.model('ModerationReport', moderationReportSchema);
export default ModerationReport;
