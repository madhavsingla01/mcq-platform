import mongoose from 'mongoose';
import {
  assertNoDuplicatedContent, normalizeLegacyQuizQuery, validateContentId,
  type ContentReference, type LegacyQuizQuery,
} from './content-reference.js';
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
        function (this: ContentReference) {
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
        function (this: ContentReference) {
          return !this.type;
        },
        'Content reference type is required',
      ],
    },
    contentId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Content ID is required'],
      validate: {
        validator: validateContentId,
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

type Entitlement = mongoose.InferSchemaType<typeof marketplaceEntitlementSchema>;
const legacyQuizIds = new WeakMap<Entitlement, unknown>();

function synchronizeEntitlementContentRef(doc: Entitlement) {
  const quizId = legacyQuizIds.get(doc);
  // If quizId was passed and contentRef is missing or has no contentId
  if (quizId && (!doc.contentRef || !doc.contentRef.contentId)) {
    doc.contentRef = {
      type: 'quiz',
      contentType: 'quiz',
      contentId: quizId,
    };
  }

  if (doc.contentRef) {
    if (doc.contentRef.type && !doc.contentRef.contentType) {
      doc.contentRef.contentType = doc.contentRef.type;
    } else if (doc.contentRef.contentType && !doc.contentRef.type) {
      doc.contentRef.type = doc.contentRef.contentType;
    }

    const cType = doc.contentRef.contentType || doc.contentRef.type;
    if (cType === 'quiz' && !quizId) {
      legacyQuizIds.set(doc, doc.contentRef.contentId);
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
        function (this: { quizId?: unknown }) {
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
    const quizId = legacyQuizIds.get(this);
    if (quizId) return quizId;
    const cType = this.contentRef?.contentType || this.contentRef?.type;
    if (cType === 'quiz') {
      return this.contentRef?.contentId;
    }
    return undefined;
  })
  .set(function (val: unknown) {
    legacyQuizIds.set(this, val);
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
  assertNoDuplicatedContent(this, FORBIDDEN_DUPLICATION_FIELDS, 'entitlements');
});

marketplaceEntitlementSchema.methods.validateSync = function (this: mongoose.HydratedDocument<Entitlement>, pathsToValidate?: string | string[], options?: Record<string, unknown>) {
  synchronizeEntitlementContentRef(this);
  let invariantMessage: string | undefined;
  try {
    assertNoDuplicatedContent(this, FORBIDDEN_DUPLICATION_FIELDS, 'entitlements');
  } catch (err) {
    invariantMessage = err instanceof Error ? err.message : String(err);
  }
  const validationError = mongoose.Model.prototype.validateSync.call(this, pathsToValidate, options);
  if (invariantMessage !== undefined) {
    const finalErr = validationError || new mongoose.Error.ValidationError();
    finalErr.message = `MarketplaceEntitlement validation failed: ${invariantMessage}`;
    finalErr.errors.contentRef = new mongoose.Error.ValidatorError({
      message: invariantMessage,
      path: 'contentRef',
      value: undefined,
    });
    return finalErr;
  }
  return validationError;
};

// Query normalization middleware for legacy queries on `quizId`
export function normalizeEntitlementQuizIdQuery(this: LegacyQuizQuery) {
  normalizeLegacyQuizQuery(this, {
    $or: [{ 'contentRef.type': 'quiz' }, { 'contentRef.contentType': 'quiz' }],
  });
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
  mongoose.models.MarketplaceEntitlement
    ? mongoose.model<Entitlement>('MarketplaceEntitlement')
    : mongoose.model('MarketplaceEntitlement', marketplaceEntitlementSchema);

export default MarketplaceEntitlement;
