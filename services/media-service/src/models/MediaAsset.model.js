import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    filePath: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false }
);

const mediaAssetSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['image', 'audio', 'video', 'captions'], default: 'image', index: true },
    status: { type: String, enum: ['queued', 'processing', 'ready', 'failed', 'cancelled'], default: 'ready', index: true },
    sourcePath: { type: String, select: false },
    processingAttempts: { type: Number, default: 0 },
    uploadRequestId: { type: String },
    referenceLeaseUntil: { type: Date },
    processingLeaseUntil: { type: Date },
    processingLeaseToken: { type: String, select: false },
    removalLeaseUntil: { type: Date },
    removalLeaseToken: { type: String, select: false },
    failureCode: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    content: {
      filePath: { type: String, select: false },
      mimeType: String, fileSize: Number, duration: Number,
      width: Number, height: Number, hasAudio: Boolean, animated: Boolean,
    },
    purpose: {
      type: String,
      enum: ['quiz-cover', 'challenge-cover', 'profile-avatar', 'profile-banner', 'question-media', 'quiz-clip'],
      required: true,
      index: true,
    },
    originalName: { type: String, required: true, maxlength: 255 },
    sourceMimeType: { type: String, required: true },
    sourceSize: { type: Number, required: true },
    fileHash: { type: String, required: true, index: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sanitized: { type: Boolean, required: true, default: true },
    variants: {
      image: { type: variantSchema },
      thumbnail: { type: variantSchema },
    },
  },
  { timestamps: true }
);

mediaAssetSchema.index({ ownerId: 1, createdAt: -1 });
mediaAssetSchema.index({ ownerId: 1, uploadRequestId: 1 }, { unique: true, partialFilterExpression: { uploadRequestId: { $type: 'string' } } });

export default mongoose.model('MediaAsset', mediaAssetSchema);
