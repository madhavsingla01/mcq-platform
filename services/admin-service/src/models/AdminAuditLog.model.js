import mongoose from 'mongoose';

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      trim: true,
      default: 'Admin',
    },
    actorEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ['user', 'quiz', 'challenge', 'report', 'system', 'role', 'announcement'],
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
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only: No updatedAt
  }
);

// Enforce strict immutability — Reject update and delete operations
const blockMutation = function (next) {
  const err = new Error('AdminAuditLog records are append-only and cannot be mutated or deleted.');
  next(err);
};

adminAuditLogSchema.pre('updateOne', blockMutation);
adminAuditLogSchema.pre('updateMany', blockMutation);
adminAuditLogSchema.pre('findOneAndUpdate', blockMutation);
adminAuditLogSchema.pre('deleteOne', blockMutation);
adminAuditLogSchema.pre('deleteMany', blockMutation);
adminAuditLogSchema.pre('findOneAndDelete', blockMutation);
adminAuditLogSchema.pre('findOneAndRemove', blockMutation);

const AdminAuditLog = mongoose.model('AdminAuditLog', adminAuditLogSchema);
export default AdminAuditLog;
