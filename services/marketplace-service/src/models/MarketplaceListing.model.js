import mongoose from 'mongoose';

export const FORBIDDEN_DUPLICATION_FIELDS = [
  'questions',
  'questionList',
  'choices',
  'options',
  'answers',
  'correctAnswers',
  'questionMedia',
  'fileBuffer',
  'rawBinary',
  'documentData',
  'sheetData',
];

export const ALLOWED_CONTENT_TYPES = [
  'quiz',
  'course',
  'bundle',
  'challenge',
  'educational_resource',
];

const contentRefSubSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      enum: {
        values: ALLOWED_CONTENT_TYPES,
        message: 'Invalid content reference type: {VALUE}',
      },
      required: [
        function () {
          return !this.type;
        },
        'Content reference type is required',
      ],
    },
    type: {
      type: String,
      enum: {
        values: ALLOWED_CONTENT_TYPES,
        message: 'Invalid content reference type: {VALUE}',
      },
    },
    contentId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Content reference ID is required'],
      validate: {
        validator: function (v) {
          if (!v) return false;
          if (mongoose.Types.ObjectId.isValid(v)) return true;
          if (typeof v === 'string' && v.trim().length > 0) return true;
          return false;
        },
        message: 'Content reference ID must be a valid ObjectId or UUID string',
      },
    },
  },
  { _id: false }
);

function synchronizeContentRefAndQuizId(doc) {
  if (doc.contentRef) {
    if (doc.contentRef.type && !doc.contentRef.contentType) {
      doc.contentRef.contentType = doc.contentRef.type;
    } else if (doc.contentRef.contentType && !doc.contentRef.type) {
      doc.contentRef.type = doc.contentRef.contentType;
    }
  }

  // Sync quizId -> contentRef if quizId is provided without contentRef
  if (doc.quizId && (!doc.contentRef || !doc.contentRef.contentId)) {
    doc.contentRef = {
      contentType: doc.contentType || 'quiz',
      type: doc.contentType || 'quiz',
      contentId: doc.quizId,
    };
  }
  // Sync contentRef -> quizId if contentRef is of type 'quiz'
  if (doc.contentRef && doc.contentRef.contentId) {
    const cType = doc.contentRef.contentType || doc.contentRef.type;
    if (cType === 'quiz' && !doc.quizId && mongoose.Types.ObjectId.isValid(doc.contentRef.contentId)) {
      doc.quizId = doc.contentRef.contentId;
    }
    // Synchronize top-level contentType with contentRef.contentType
    if (cType && doc.contentType !== cType) {
      doc.contentType = cType;
    }
  }
}

const marketplaceListingSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be alphanumeric words separated by single hyphens'],
      minlength: [3, 'Slug must be at least 3 characters'],
      maxlength: [120, 'Slug cannot exceed 120 characters'],
    },
    listingCode: {
      type: String,
      uppercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [500, 'Summary cannot exceed 500 characters'],
      default: '',
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller ID is required'],
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: [
        function () {
          return !this.contentRef || !this.contentRef.contentId;
        },
        'Quiz reference is required',
      ],
    },
    contentRef: {
      type: contentRefSubSchema,
      required: [
        function () {
          return !this.quizId;
        },
        'Content reference is required',
      ],
    },
    contentType: {
      type: String,
      enum: {
        values: ['quiz', 'course', 'bundle', 'challenge', 'educational_resource'],
        message: 'Invalid content type: {VALUE}',
      },
      default: 'quiz',
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    tags: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          maxlength: [50, 'Tag cannot exceed 50 characters'],
        },
      ],
      default: [],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'USD',
      match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code'],
    },
    isFree: {
      type: Boolean,
      default: function () {
        return this.price === 0;
      },
    },
    discountPrice: {
      type: Number,
      min: [0, 'Discount price cannot be negative'],
      default: null,
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
        values: ['draft', 'pending_review', 'published', 'archived'],
        message: 'Invalid status: {VALUE}',
      },
      default: 'draft',
    },
    previewQuestionsCount: {
      type: Number,
      min: [0, 'Preview questions count cannot be negative'],
      default: 0,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: null,
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
    salesCount: {
      type: Number,
      min: [0, 'Sales count cannot be negative'],
      default: 0,
    },
    currentRevision: {
      type: Number,
      min: [1, 'Current revision must be at least 1'],
      default: 1,
    },
    version: {
      type: Number,
      default: 0,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: '__v',
    strict: 'throw',
  }
);

/**
 * Applies strict pricing invariants and Zero Duplication rules.
 * @param {MarketplaceListing} doc
 */
function applyPricingAndDuplicationInvariants(doc) {
  // 1. Zero Duplication Invariant: strictly forbid storing quiz questions, choices, answers, or media subdocuments
  const rawObj = doc.toObject ? doc.toObject() : doc;
  for (const forbiddenField of FORBIDDEN_DUPLICATION_FIELDS) {
    if (
      (doc.get && doc.get(forbiddenField) !== undefined) ||
      rawObj[forbiddenField] !== undefined ||
      doc[forbiddenField] !== undefined ||
      (doc._doc && doc._doc[forbiddenField] !== undefined)
    ) {
      throw new Error(
        `Zero Duplication Invariant violation: storing '${forbiddenField}' is strictly forbidden in marketplace listings`
      );
    }
  }

  // 2. Negative price forbidden
  if (doc.price !== undefined && doc.price < 0) {
    throw new Error('Price cannot be negative');
  }

  // 3. Free pricing rules:
  // Paid listings require price > 0 (strictly check before any normalization)
  if (doc.isFree === false && (doc.price === undefined || doc.price <= 0)) {
    throw new Error('Paid listings must have a price greater than 0');
  }

  // If isFree is true, price must be 0
  if (doc.isFree === true && doc.price > 0) {
    throw new Error('Payable amounts on free listings are strictly forbidden. Price must be 0 when isFree is true.');
  }

  // If price is 0 and isFree is not explicitly set to false, ensure isFree is true
  if (doc.price === 0) {
    doc.isFree = true;
  }

  // Discount price rules
  if (doc.discountPrice !== null && doc.discountPrice !== undefined) {
    if (doc.isFree) {
      throw new Error('Discount price cannot be applied to free listings');
    }
    if (doc.discountPrice >= doc.price) {
      throw new Error('Discount price must be less than the regular price');
    }
    if (doc.discountPrice < 0) {
      throw new Error('Discount price cannot be negative');
    }
  }
}

marketplaceListingSchema.pre('validate', function () {
  synchronizeContentRefAndQuizId(this);
  applyPricingAndDuplicationInvariants(this);
});

marketplaceListingSchema.methods.validateSync = function (pathsToValidate, options) {
  synchronizeContentRefAndQuizId(this);
  let invariantErr = null;
  try {
    applyPricingAndDuplicationInvariants(this);
  } catch (err) {
    invariantErr = err;
  }
  const validationError = mongoose.Model.prototype.validateSync.call(this, pathsToValidate, options);
  if (invariantErr) {
    const finalErr = validationError || new mongoose.Error.ValidationError(this);
    finalErr.message = `MarketplaceListing validation failed: ${invariantErr.message}`;
    finalErr.errors.price = new mongoose.Error.ValidatorError({
      message: invariantErr.message,
      name: 'ValidatorError',
      path: 'price',
      value: this.price,
    });
    return finalErr;
  }
  return validationError;
};

/**
 * Query normalization middleware to ensure legacy queries on `quizId`
 * also match `contentRef.contentId` with `contentType: 'quiz'`.
 */
export function normalizeQuizIdQuery() {
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
    'contentRef.contentType': 'quiz',
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

marketplaceListingSchema.pre(
  ['find', 'findOne', 'countDocuments', 'findOneAndUpdate'],
  normalizeQuizIdQuery
);

// Single and compound indexes
marketplaceListingSchema.index({ sellerId: 1, status: 1 });
marketplaceListingSchema.index({ sellerId: 1, createdAt: -1 });
marketplaceListingSchema.index({ status: 1, category: 1, createdAt: -1 });
marketplaceListingSchema.index({ status: 1, contentType: 1, createdAt: -1 });
marketplaceListingSchema.index({ status: 1, price: 1 });
marketplaceListingSchema.index({ tags: 1, status: 1 });
marketplaceListingSchema.index({ quizId: 1 });
marketplaceListingSchema.index({ 'contentRef.contentId': 1, 'contentRef.contentType': 1 });
marketplaceListingSchema.index(
  { title: 'text', description: 'text', summary: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, summary: 3, description: 1 } }
);

export const MarketplaceListing =
  mongoose.models.MarketplaceListing || mongoose.model('MarketplaceListing', marketplaceListingSchema);

export default MarketplaceListing;
