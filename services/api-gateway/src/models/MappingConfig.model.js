import mongoose from 'mongoose';

const mappingConfigSchema = new mongoose.Schema(
  {
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Upload',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    detectedColumns: {
      type: [String],
      default: [],
    },
    mappedColumns: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    autoMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    confidence: {
      type: Number,
      default: null,
    },
    validationErrors: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    source: {
      type: String,
      enum: ['auto', 'manual', 'import'],
      default: 'manual',
    },
  },
  {
    timestamps: true,
  }
);

mappingConfigSchema.index({ uploadId: 1, createdAt: -1 });
mappingConfigSchema.index({ userId: 1, createdAt: -1 });

const MappingConfig = mongoose.model('MappingConfig', mappingConfigSchema);

export default MappingConfig;
