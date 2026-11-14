import mongoose from 'mongoose';

const payoutSettingsSchema = new mongoose.Schema(
  {
    stripeAccountId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['unlinked', 'pending', 'active', 'restricted'],
        message: 'Invalid payout status: {VALUE}',
      },
      default: 'unlinked',
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Payout currency must be a 3-letter ISO code'],
    },
  },
  { _id: false }
);

const sellerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, 'Bio cannot exceed 1000 characters'],
      default: '',
    },
    payoutSettings: {
      type: payoutSettingsSchema,
      default: () => ({ status: 'unlinked', currency: 'USD' }),
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'active', 'suspended', 'verified'],
        message: 'Invalid seller status: {VALUE}',
      },
      default: 'pending',
    },
    rating: {
      type: Number,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
      default: 0,
    },
    reviewCount: {
      type: Number,
      min: [0, 'Review count cannot be negative'],
      default: 0,
    },
    totalSales: {
      type: Number,
      min: [0, 'Total sales cannot be negative'],
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sellerProfileSchema.index({ status: 1, rating: -1 });

export const SellerProfile =
  mongoose.models.SellerProfile || mongoose.model('SellerProfile', sellerProfileSchema);

export default SellerProfile;
