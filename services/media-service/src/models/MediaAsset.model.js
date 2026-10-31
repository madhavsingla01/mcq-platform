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
    purpose: {
      type: String,
      enum: ['quiz-cover', 'profile-avatar', 'profile-banner', 'question-media'],
      required: true,
      index: true,
    },
    originalName: { type: String, required: true, maxlength: 255 },
    sourceMimeType: { type: String, required: true },
    sourceSize: { type: Number, required: true },
    fileHash: { type: String, required: true, index: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    sanitized: { type: Boolean, required: true, default: true },
    variants: {
      image: { type: variantSchema, required: true },
      thumbnail: { type: variantSchema, required: true },
    },
  },
  { timestamps: true }
);

mediaAssetSchema.index({ ownerId: 1, createdAt: -1 });

export default mongoose.model('MediaAsset', mediaAssetSchema);
