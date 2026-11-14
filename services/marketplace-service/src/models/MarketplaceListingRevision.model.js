import mongoose from 'mongoose';

const snapshotSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      default: 'General',
    },
  },
  { _id: false }
);

const marketplaceListingRevisionSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketplaceListing',
      required: [true, 'Listing ID is required'],
      index: true,
    },
    revisionNumber: {
      type: Number,
      required: [true, 'Revision number is required'],
      min: [1, 'Revision number must be at least 1'],
    },
    snapshot: {
      type: snapshotSchema,
      required: [true, 'Snapshot is required'],
    },
    changeLog: {
      type: String,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewStatus: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'],
        message: 'Invalid review status: {VALUE}',
      },
      default: 'pending',
      index: true,
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index on (listingId, revisionNumber)
marketplaceListingRevisionSchema.index({ listingId: 1, revisionNumber: 1 }, { unique: true });

// Review audit queries index
marketplaceListingRevisionSchema.index({ reviewStatus: 1, submittedAt: 1 });

export const MarketplaceListingRevision =
  mongoose.models.MarketplaceListingRevision ||
  mongoose.model('MarketplaceListingRevision', marketplaceListingRevisionSchema);

export default MarketplaceListingRevision;
