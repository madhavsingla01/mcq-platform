import mongoose from 'mongoose';
import { FORBIDDEN_DUPLICATION_FIELDS } from './MarketplaceListing.model.js';

export const ALLOWED_ENTITLEMENT_CONTENT_TYPES = [
  'quiz',
  'course',
  'bundle',
  'challenge',
  'educational_resource',
  'deck',
];

const contentRefSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ALLOWED_ENTITLEMENT_CONTENT_TYPES,
        message: 'Invalid contentRef type: {VALUE}',
      },
      required: [
        function () {
          return !this.contentType;
        },
        'Content reference type is required',
      ],
    },
    contentType: {
      type: String,
      enum: {
        values: ALLOWED_ENTITLEMENT_CONTENT_TYPES,
        message: 'Invalid contentRef contentType: {VALUE}',
      },
      required: [
        function () {
          return !this.type;
        },
        'Content reference type is required',
      ],
    },
    contentId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Content ID is required'],
      validate: {
        validator: function (v) {
          if (!v) return false;
          if (mongoose.Types.ObjectId.isValid(v)) return true;
          if (typeof v === 'string' && v.trim().length > 0) return true;
          return false;
        },
        message: 'Content ID must be a valid ObjectId or UUID string',
      },
    },
  },
  { _id: false }
);

contentRefSchema.pre('validate', function () {
  if (this.type && !this.contentType) {
    this.contentType = this.type;
  } else if (this.contentType && !this.type) {
    this.type = this.contentType;
  }
});

function synchronizeEntitlementContentRef(doc) {
  // If quizId was passed and contentRef is missing or has no contentId
  if (doc.quizId && (!doc.contentRef || !doc.contentRef.contentId)) {
    doc.contentRef = {
      type: 'quiz',
      contentType: 'quiz',
      contentId: doc.quizId,
    };
  }

  if (doc.contentRef) {
    if (doc.contentRef.type && !doc.contentRef.contentType) {
      doc.contentRef.contentType = doc.contentRef.type;
    } else if (doc.contentRef.contentType && !doc.contentRef.type) {
      doc.contentRef.type = doc.contentRef.contentType;
    }

    const cType = doc.contentRef.contentType || doc.contentRef.type;
    if (cType === 'quiz' && !doc._quizId) {
      doc._quizId = doc.contentRef.contentId;
    }
  }
}

function applyDuplicationInvariants(doc) {
  const rawObj = doc.toObject ? doc.toObject() : doc;
  for (const forbiddenField of FORBIDDEN_DUPLICATION_FIELDS) {
    if (
      (doc.get && doc.get(forbiddenField) !== undefined) ||
      rawObj[forbiddenField] !== undefined ||
      doc[forbiddenField] !== undefined ||
      (doc._doc && doc._doc[forbiddenField] !== undefined)
    ) {
      throw new Error(
        `Zero Duplication Invariant violation: storing '${forbiddenField}' is strictly forbidden in marketplace entitlements`
      );
    }
  }
}

const marketplaceEntitlementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketplaceListing',
      required: [true, 'Listing ID is required'],
    },
    contentRef: {
      type: contentRefSchema,
      required: [
        function () {
          return !this.quizId;
        },
        'Content reference is required',
      ],
    },
    licenseType: {
      type: String,
      enum: {
        values: ['single_user', 'team', 'institutional', 'subscription'],
        message: 'Invalid license type: {VALUE}',
      },
      default: 'single_user',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'revoked', 'expired'],
        message: 'Invalid entitlement status: {VALUE}',
      },
      default: 'active',
      index: true,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: {
        values: ['purchase', 'free', 'promo'],
        message: 'Invalid source: {VALUE}',
      },
      default: 'purchase',
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: 'throw',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Backward-compatibility quizId virtual getter and setter
marketplaceEntitlementSchema
  .virtual('quizId')
  .get(function () {
    if (this._quizId) return this._quizId;
    const cType = this.contentRef?.contentType || this.contentRef?.type;
    if (cType === 'quiz') {
      return this.contentRef?.contentId;
    }
    return undefined;
  })
  .set(function (val) {
    this._quizId = val;
    if (!this.contentRef) {
      this.contentRef = {
        type: 'quiz',
        contentType: 'quiz',
        contentId: val,
      };
    } else {
      this.contentRef.type = 'quiz';
      this.contentRef.contentType = 'quiz';
      this.contentRef.contentId = val;
    }
  });

marketplaceEntitlementSchema.pre('validate', function () {
  synchronizeEntitlementContentRef(this);
  applyDuplicationInvariants(this);
});

marketplaceEntitlementSchema.methods.validateSync = function (pathsToValidate, options) {
  synchronizeEntitlementContentRef(this);
  let invariantErr = null;
  try {
    applyDuplicationInvariants(this);
  } catch (err) {
    invariantErr = err;
  }
  const validationError = mongoose.Model.prototype.validateSync.call(this, pathsToValidate, options);
  if (invariantErr) {
    const finalErr = validationError || new mongoose.Error.ValidationError(this);
    finalErr.message = `MarketplaceEntitlement validation failed: ${invariantErr.message}`;
    finalErr.errors.contentRef = new mongoose.Error.ValidatorError({
      message: invariantErr.message,
      name: 'ValidatorError',
      path: 'contentRef',
      value: undefined,
    });
    return finalErr;
  }
  return validationError;
};

// Query normalization middleware for legacy queries on `quizId`
export function normalizeEntitlementQuizIdQuery() {
  const filter = this.getQuery ? this.getQuery() : null;
  if (!filter || filter.quizId === undefined) return;

  const rawQuizId = filter.quizId;
  delete filter.quizId;

  let contentIdQuery = rawQuizId;
  if (rawQuizId) {
    if (mongoose.Types.ObjectId.isValid(rawQuizId)) {
      const objId = typeof rawQuizId === 'string' ? new mongoose.Types.ObjectId(rawQuizId) : rawQuizId;
      const strId = rawQuizId.toString();
      contentIdQuery = { $in: [objId, strId] };
    } else if (rawQuizId.$in && Array.isArray(rawQuizId.$in)) {
      const expanded = [];
      for (const item of rawQuizId.$in) {
        expanded.push(item);
        if (mongoose.Types.ObjectId.isValid(item)) {
          if (typeof item === 'string') {
            expanded.push(new mongoose.Types.ObjectId(item));
          } else {
            expanded.push(item.toString());
          }
        }
      }
      contentIdQuery = { $in: expanded };
    }
  }

  const legacyCondition = { quizId: rawQuizId };
  const contentRefCondition = {
    'contentRef.contentId': contentIdQuery,
    $or: [
      { 'contentRef.type': 'quiz' },
      { 'contentRef.contentType': 'quiz' },
    ],
  };

  const orClause = [legacyCondition, contentRefCondition];

  if (filter.$or) {
    if (!filter.$and) {
      filter.$and = [];
    }
    filter.$and.push({ $or: filter.$or });
    filter.$and.push({ $or: orClause });
    delete filter.$or;
  } else {
    filter.$or = orClause;
  }
}

marketplaceEntitlementSchema.pre(
  ['find', 'findOne', 'countDocuments', 'findOneAndUpdate'],
  normalizeEntitlementQuizIdQuery
);

// Method to verify if entitlement is currently effective (active and not expired)
marketplaceEntitlementSchema.methods.isEffective = function () {
  if (this.status !== 'active') return false;
  if (this.validUntil && new Date(this.validUntil) <= new Date()) return false;
  return true;
};

// Compound unique constraint on (userId, listingId)
marketplaceEntitlementSchema.index({ userId: 1, listingId: 1 }, { unique: true });

// Fast lookup index for attempt-service verification gate
marketplaceEntitlementSchema.index({ userId: 1, 'contentRef.contentId': 1, status: 1 });

// Additional lookup indexes
marketplaceEntitlementSchema.index({ listingId: 1, status: 1 });
marketplaceEntitlementSchema.index({ userId: 1, status: 1, validUntil: 1 });

export const MarketplaceEntitlement =
  mongoose.models.MarketplaceEntitlement ||
  mongoose.model('MarketplaceEntitlement', marketplaceEntitlementSchema);

export default MarketplaceEntitlement;
