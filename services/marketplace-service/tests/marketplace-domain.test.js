import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  MarketplaceListing,
  MarketplaceEntitlement,
  MarketplaceListingRevision,
  SellerProfile,
  FORBIDDEN_DUPLICATION_FIELDS,
  normalizeQuizIdQuery,
  normalizeEntitlementQuizIdQuery,
} from '../src/models/index.js';

import {
  verifyQuizOwnership,
  verifyQuizOwnershipWithDb,
  verifyEducationalAssetOwnership,
  verifyEducationalAssetOwnershipWithDb,
  OwnershipError,
} from '../src/services/ownership.service.js';

import {
  LISTING_STATUSES,
  canTransition,
  validateStateTransition,
  transitionListing,
  InvalidStateTransitionError,
} from '../src/services/state-machine.service.js';

describe('Marketplace Phase 2 Domain Architecture & Models Test Suite', () => {
  const sampleUserId = new mongoose.Types.ObjectId();
  const sampleQuizId = new mongoose.Types.ObjectId();
  const sampleListingId = new mongoose.Types.ObjectId();

  // =========================================================================
  // 1. MarketplaceListing Model Validations & Pricing Invariants
  // =========================================================================
  describe('1. MarketplaceListing Model Validations', () => {
    it('creates a valid listing document with defaults and conforms to schema', () => {
      const listing = new MarketplaceListing({
        slug: 'usmle-step-1-high-yield-pack',
        title: 'USMLE Step 1 High Yield Pack',
        description: 'Comprehensive high-yield questions covering pathology and pharmacology.',
        summary: 'High yield clinical scenarios.',
        sellerId: sampleUserId,
        quizId: sampleQuizId,
        contentType: 'quiz',
        category: 'Medicine',
        tags: ['usmle', 'step1', 'pathology'],
        price: 49.99,
        currency: 'USD',
        isFree: false,
        discountPrice: 39.99,
      });

      const err = listing.validateSync();
      assert.equal(err, undefined, 'Valid listing should pass validation without error');
      assert.equal(listing.status, 'draft');
      assert.equal(listing.licenseType, 'single_user');
      assert.equal(listing.currentRevision, 1);
      assert.equal(listing.version, 0);
      assert.equal(listing.rating, 0);
      assert.equal(listing.reviewCount, 0);
      assert.equal(listing.salesCount, 0);
    });

    it('requires required fields: slug, title, price, sellerId, quizId', () => {
      const emptyListing = new MarketplaceListing({});
      const err = emptyListing.validateSync();
      assert.ok(err, 'Validation should fail on empty listing');
      assert.ok(err.errors.title, 'title is required');
      assert.ok(err.errors.slug, 'slug is required');
      assert.ok(err.errors.price, 'price is required');
      assert.ok(err.errors.sellerId, 'sellerId is required');
      assert.ok(err.errors.quizId, 'quizId is required');
    });

    it('enforces title and slug constraints (minlength, maxlength, slug regex)', () => {
      // Too short title (< 3 chars)
      const shortTitle = new MarketplaceListing({
        slug: 'valid-slug',
        title: 'Hi',
        price: 10,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const errShort = shortTitle.validateSync();
      assert.ok(errShort?.errors?.title, 'Title < 3 chars should fail');

      // Invalid slug format (uppercase, spaces, special chars)
      const badSlug = new MarketplaceListing({
        slug: 'Invalid Slug!',
        title: 'Valid Long Title',
        price: 10,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const errSlug = badSlug.validateSync();
      assert.ok(errSlug?.errors?.slug, 'Invalid slug format should fail');
    });

    it('validates allowed content types and license types enums', () => {
      const badEnums = new MarketplaceListing({
        slug: 'valid-slug-pack',
        title: 'Valid Title Here',
        price: 10,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
        contentType: 'invalid_type',
        licenseType: 'invalid_license',
      });
      const err = badEnums.validateSync();
      assert.ok(err?.errors?.contentType, 'Invalid contentType should fail');
      assert.ok(err?.errors?.licenseType, 'Invalid licenseType should fail');
    });

    it('Pricing Invariant: rejects negative price amount', () => {
      const negativePrice = new MarketplaceListing({
        slug: 'negative-price-pack',
        title: 'Negative Price Listing',
        price: -15.0,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const err = negativePrice.validateSync();
      assert.ok(err, 'Negative price must fail validation');
      assert.match(err.message, /Price cannot be negative/i);
    });

    it('Pricing Invariant: payable amounts on free listings are strictly forbidden', () => {
      const paidFreeListing = new MarketplaceListing({
        slug: 'paid-free-listing',
        title: 'Paid Free Listing Conflict',
        price: 25.0,
        isFree: true,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const err = paidFreeListing.validateSync();
      assert.ok(err, 'Payable amount on isFree=true listing must fail');
      assert.match(err.message, /Payable amounts on free listings are strictly forbidden/i);
    });

    it('Pricing Invariant: rejects paid listing with zero price (isFree: false, price: 0)', () => {
      const zeroPaidListing = new MarketplaceListing({
        slug: 'invalid-paid-zero',
        title: 'Invalid Paid Zero Pack',
        price: 0,
        isFree: false,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const err = zeroPaidListing.validateSync();
      assert.ok(err, 'Paid listing with price 0 and isFree: false must fail validation');
      assert.match(err.message, /Paid listings must have a price greater than 0/i);
      assert.equal(zeroPaidListing.isFree, false, 'isFree must not be silently mutated to true');
    });

    it('Pricing Invariant: free listing with price 0 succeeds and normalizes isFree to true', () => {
      const freeListing = new MarketplaceListing({
        slug: 'free-study-guide',
        title: 'Free Study Guide Pack',
        price: 0,
        isFree: true,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const err = freeListing.validateSync();
      assert.equal(err, undefined, 'Free listing with price 0 must pass validation');
      assert.equal(freeListing.isFree, true, 'isFree must remain true');

      const unassignedFree = new MarketplaceListing({
        slug: 'free-study-guide-unassigned',
        title: 'Free Study Guide Unassigned',
        price: 0,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const unassignedErr = unassignedFree.validateSync();
      assert.equal(unassignedErr, undefined, 'Unassigned isFree with price 0 must pass validation');
      assert.equal(unassignedFree.isFree, true, 'price 0 must normalize isFree to true');
    });

    it('Pricing Invariant: discountPrice must be strictly less than price', () => {
      const badDiscount = new MarketplaceListing({
        slug: 'bad-discount-listing',
        title: 'Bad Discount Pack',
        price: 20.0,
        discountPrice: 25.0, // greater than price
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const err = badDiscount.validateSync();
      assert.ok(err, 'Discount price >= regular price must fail');
      assert.match(err.message, /Discount price must be less than the regular price/i);

      // Discount price cannot be applied to free listings
      const freeWithDiscount = new MarketplaceListing({
        slug: 'free-with-discount',
        title: 'Free Pack With Discount',
        price: 0,
        isFree: true,
        discountPrice: 5.0,
        sellerId: sampleUserId,
        quizId: sampleQuizId,
      });
      const errFree = freeWithDiscount.validateSync();
      assert.ok(errFree, 'Free listing with discount price must fail');
      assert.match(errFree.message, /Discount price cannot be applied to free listings/i);
    });

    it('Zero Duplication Invariant: strictly forbids storing quiz questions, choices, or answers', () => {
      const forbiddenPayloads = [
        { questions: [{ text: 'What is mitochondria?', answer: 'Powerhouse' }] },
        { questionList: ['Q1', 'Q2'] },
        { choices: ['Option A', 'Option B'] },
        { options: ['A', 'B', 'C'] },
        { answers: ['A'] },
        { correctAnswers: [0, 1] },
        { questionMedia: ['https://cdn.quizfocus.com/img1.png'] },
      ];

      for (const payload of forbiddenPayloads) {
        assert.throws(
          () => {
            const doc = new MarketplaceListing({
              slug: 'attempt-question-duplication',
              title: 'Duplication Attempt Pack',
              price: 15.0,
              sellerId: sampleUserId,
              quizId: sampleQuizId,
              ...payload,
            });
            const err = doc.validateSync();
            if (err) throw err;
          },
          /Zero Duplication Invariant violation|strict mode|extraneous|Field `.*` is not in schema/i,
          `Expected injection of ${Object.keys(payload)[0]} to be rejected by schema`
        );
      }
    });
  });

  // =========================================================================
  // 2. MarketplaceEntitlement Model Validations & Lifecycle
  // =========================================================================
  describe('2. MarketplaceEntitlement Model Validations', () => {
    it('creates a valid active entitlement document with default values', () => {
      const entitlement = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: {
          type: 'quiz',
          contentId: sampleQuizId,
        },
        licenseType: 'single_user',
        source: 'purchase',
      });

      const err = entitlement.validateSync();
      assert.equal(err, undefined);
      assert.equal(entitlement.status, 'active');
      assert.equal(entitlement.licenseType, 'single_user');
      assert.equal(entitlement.source, 'purchase');
      assert.ok(entitlement.grantedAt);
      assert.equal(entitlement.validUntil, null);
      assert.equal(entitlement.isEffective(), true);
    });

    it('requires userId, listingId, and valid contentRef (type and contentId)', () => {
      const empty = new MarketplaceEntitlement({});
      const err = empty.validateSync();
      assert.ok(err);
      assert.ok(err.errors.userId);
      assert.ok(err.errors.listingId);
      assert.ok(err.errors.contentRef);

      const invalidType = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: {
          type: 'unsupported_content_type',
          contentId: sampleQuizId,
        },
      });
      const errType = invalidType.validateSync();
      assert.ok(errType?.errors?.['contentRef.type']);
    });

    it('isEffective() correctly determines license validity', () => {
      const activePerpetual = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: { type: 'quiz', contentId: sampleQuizId },
        status: 'active',
        validUntil: null,
      });
      assert.equal(activePerpetual.isEffective(), true);

      // Future expiration
      const futureDate = new Date(Date.now() + 86400000 * 30);
      const activeUnexpired = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: { type: 'quiz', contentId: sampleQuizId },
        status: 'active',
        validUntil: futureDate,
      });
      assert.equal(activeUnexpired.isEffective(), true);

      // Past expiration
      const pastDate = new Date(Date.now() - 86400000);
      const expired = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: { type: 'quiz', contentId: sampleQuizId },
        status: 'active',
        validUntil: pastDate,
      });
      assert.equal(expired.isEffective(), false);

      // Revoked entitlement
      const revoked = new MarketplaceEntitlement({
        userId: sampleUserId,
        listingId: sampleListingId,
        contentRef: { type: 'quiz', contentId: sampleQuizId },
        status: 'revoked',
        validUntil: futureDate,
      });
      assert.equal(revoked.isEffective(), false);
    });
  });

  // =========================================================================
  // 3. MarketplaceListingRevision Model Validations
  // =========================================================================
  describe('3. MarketplaceListingRevision Model Validations', () => {
    it('creates a valid revision document with snapshot payload', () => {
      const revision = new MarketplaceListingRevision({
        listingId: sampleListingId,
        revisionNumber: 1,
        snapshot: {
          title: 'Initial Listing Snapshot',
          description: 'Original description of the listing pack.',
          summary: 'Original summary.',
          price: 19.99,
          currency: 'USD',
          tags: ['test', 'revision'],
          category: 'Engineering',
        },
        changeLog: 'Initial publication revision',
      });

      const err = revision.validateSync();
      assert.equal(err, undefined);
      assert.equal(revision.revisionNumber, 1);
      assert.equal(revision.reviewStatus, 'pending');
      assert.equal(revision.snapshot.price, 19.99);
      assert.ok(revision.submittedAt);
    });

    it('requires listingId, revisionNumber >= 1, and snapshot', () => {
      const emptyRev = new MarketplaceListingRevision({});
      const err = emptyRev.validateSync();
      assert.ok(err);
      assert.ok(err.errors.listingId);
      assert.ok(err.errors.revisionNumber);
      assert.ok(err.errors.snapshot);

      const invalidRevNum = new MarketplaceListingRevision({
        listingId: sampleListingId,
        revisionNumber: 0, // must be at least 1
        snapshot: { title: 'T', price: 10 },
      });
      const errNum = invalidRevNum.validateSync();
      assert.ok(errNum?.errors?.revisionNumber);
    });
  });

  // =========================================================================
  // 4. SellerProfile Model Validations
  // =========================================================================
  describe('4. SellerProfile Model Validations', () => {
    it('creates a valid seller profile document with default payout settings', () => {
      const profile = new SellerProfile({
        userId: sampleUserId,
        displayName: 'Dr. Jane Smith',
        bio: 'Board-certified pathologist and medical educator.',
      });

      const err = profile.validateSync();
      assert.equal(err, undefined);
      assert.equal(profile.displayName, 'Dr. Jane Smith');
      assert.equal(profile.status, 'pending');
      assert.equal(profile.rating, 0);
      assert.equal(profile.reviewCount, 0);
      assert.equal(profile.totalSales, 0);
      assert.equal(profile.payoutSettings.status, 'unlinked');
      assert.equal(profile.payoutSettings.currency, 'USD');
    });

    it('enforces displayName length bounds (2 to 50 chars) and bio limit (<=1000 chars)', () => {
      const tooShortName = new SellerProfile({
        userId: sampleUserId,
        displayName: 'J',
      });
      const errShort = tooShortName.validateSync();
      assert.ok(errShort?.errors?.displayName);

      const tooLongBio = new SellerProfile({
        userId: sampleUserId,
        displayName: 'Valid Name',
        bio: 'a'.repeat(1001),
      });
      const errBio = tooLongBio.validateSync();
      assert.ok(errBio?.errors?.bio);
    });

    it('enforces rating range bounds (0 <= rating <= 5)', () => {
      const negativeRating = new SellerProfile({
        userId: sampleUserId,
        displayName: 'Valid Name',
        rating: -1,
      });
      const errNeg = negativeRating.validateSync();
      assert.ok(errNeg?.errors?.rating);

      const overRating = new SellerProfile({
        userId: sampleUserId,
        displayName: 'Valid Name',
        rating: 5.5,
      });
      const errOver = overRating.validateSync();
      assert.ok(errOver?.errors?.rating);
    });
  });

  // =========================================================================
  // 5. State Machine Lifecycle Transitions
  // =========================================================================
  describe('5. Lifecycle State Machine Service', () => {
    it('canTransition accurately reports valid and invalid transitions', () => {
      // Valid transitions
      assert.equal(canTransition(LISTING_STATUSES.DRAFT, LISTING_STATUSES.PENDING_REVIEW), true);
      assert.equal(canTransition(LISTING_STATUSES.PENDING_REVIEW, LISTING_STATUSES.PUBLISHED), true);
      assert.equal(canTransition(LISTING_STATUSES.PENDING_REVIEW, LISTING_STATUSES.DRAFT), true);
      assert.equal(canTransition(LISTING_STATUSES.PUBLISHED, LISTING_STATUSES.ARCHIVED), true);
      assert.equal(canTransition(LISTING_STATUSES.ARCHIVED, LISTING_STATUSES.DRAFT), true);

      // Forbidden transitions
      assert.equal(canTransition(LISTING_STATUSES.DRAFT, LISTING_STATUSES.PUBLISHED), false);
      assert.equal(canTransition(LISTING_STATUSES.ARCHIVED, LISTING_STATUSES.PUBLISHED), false);
      assert.equal(canTransition(LISTING_STATUSES.PUBLISHED, LISTING_STATUSES.DRAFT), false);
      assert.equal(canTransition(LISTING_STATUSES.DRAFT, LISTING_STATUSES.ARCHIVED), false);
      assert.equal(canTransition(LISTING_STATUSES.DRAFT, LISTING_STATUSES.DRAFT), false);
    });

    it('validateStateTransition throws InvalidStateTransitionError for illegal transitions', () => {
      // Direct jump from draft -> published (must go through pending_review)
      assert.throws(
        () => validateStateTransition(LISTING_STATUSES.DRAFT, LISTING_STATUSES.PUBLISHED),
        (err) => err instanceof InvalidStateTransitionError && /pending_review/i.test(err.message)
      );

      // Direct jump from archived -> published
      assert.throws(
        () => validateStateTransition(LISTING_STATUSES.ARCHIVED, LISTING_STATUSES.PUBLISHED),
        (err) => err instanceof InvalidStateTransitionError && /draft/i.test(err.message)
      );

      // Transition to same status
      assert.throws(
        () => validateStateTransition(LISTING_STATUSES.PUBLISHED, LISTING_STATUSES.PUBLISHED),
        (err) => err instanceof InvalidStateTransitionError && /same status/i.test(err.message)
      );
    });

    it('transitionListing applies state mutation and updates publishedAt / archivedAt timestamps', () => {
      const mockListing = {
        status: LISTING_STATUSES.DRAFT,
        publishedAt: null,
        archivedAt: null,
      };

      // 1. draft -> pending_review
      transitionListing(mockListing, LISTING_STATUSES.PENDING_REVIEW);
      assert.equal(mockListing.status, LISTING_STATUSES.PENDING_REVIEW);

      // 2. pending_review -> published
      const publishTime = new Date('2026-11-11T10:00:00Z');
      transitionListing(mockListing, LISTING_STATUSES.PUBLISHED, { timestamp: publishTime });
      assert.equal(mockListing.status, LISTING_STATUSES.PUBLISHED);
      assert.deepEqual(mockListing.publishedAt, publishTime);
      assert.equal(mockListing.archivedAt, null);

      // 3. published -> archived
      const archiveTime = new Date('2026-11-11T12:00:00Z');
      transitionListing(mockListing, LISTING_STATUSES.ARCHIVED, { timestamp: archiveTime });
      assert.equal(mockListing.status, LISTING_STATUSES.ARCHIVED);
      assert.deepEqual(mockListing.archivedAt, archiveTime);

      // 4. archived -> draft (reactivate)
      transitionListing(mockListing, LISTING_STATUSES.DRAFT);
      assert.equal(mockListing.status, LISTING_STATUSES.DRAFT);
      assert.equal(mockListing.publishedAt, null);
      assert.equal(mockListing.archivedAt, null);
    });
  });

  // =========================================================================
  // 6. Content Ownership Service
  // =========================================================================
  describe('6. Authoritative Content Ownership Service', () => {
    const verifiedSellerId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    it('successfully verifies quiz ownership when seller is the verified uploader', () => {
      const validQuiz = {
        _id: sampleQuizId,
        uploader: verifiedSellerId,
        title: 'Board Exam Prep Quiz',
        isDeleted: false,
        isRestricted: false,
      };

      const result = verifyQuizOwnership({ quiz: validQuiz, sellerId: verifiedSellerId });
      assert.equal(result.allowed, true);
      assert.equal(result.quizId, sampleQuizId.toString());
      assert.equal(result.sellerId, verifiedSellerId.toString());

      // Zero Leakage: ensure result contains NO questions, options, or correct answers
      assert.equal(result.questions, undefined);
      assert.equal(result.answers, undefined);
    });

    it('rejects listing when seller is NOT the quiz author with HTTP 403 OwnershipError', () => {
      const unownedQuiz = {
        _id: sampleQuizId,
        uploader: otherUserId,
        title: 'Someone Else Quiz',
        isDeleted: false,
        isRestricted: false,
      };

      assert.throws(
        () => verifyQuizOwnership({ quiz: unownedQuiz, sellerId: verifiedSellerId }),
        (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_CONTENT_NOT_OWNED' && err.statusCode === 403
      );
    });

    it('rejects listing of deleted or restricted quizzes', () => {
      const deletedQuiz = {
        _id: sampleQuizId,
        uploader: verifiedSellerId,
        isDeleted: true,
      };
      assert.throws(
        () => verifyQuizOwnership({ quiz: deletedQuiz, sellerId: verifiedSellerId }),
        (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_CONTENT_DELETED'
      );

      const restrictedQuiz = {
        _id: sampleQuizId,
        uploader: verifiedSellerId,
        isRestricted: true,
      };
      assert.throws(
        () => verifyQuizOwnership({ quiz: restrictedQuiz, sellerId: verifiedSellerId }),
        (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_CONTENT_RESTRICTED'
      );
    });

    it('rejects when target quiz does not exist', () => {
      assert.throws(
        () => verifyQuizOwnership({ quiz: null, sellerId: verifiedSellerId }),
        (err) => err instanceof OwnershipError && err.code === 'RESOURCE_NOT_FOUND'
      );
    });
  });

  // =========================================================================
  // 7. Database Indexes Declarations
  // =========================================================================
  describe('7. Model Indexes Declarations Verification', () => {
    it('verifies MarketplaceListing indexes', () => {
      const listingIndexes = MarketplaceListing.schema.indexes();

      // Check unique slug index
      const hasUniqueSlug = listingIndexes.some(
        ([fields, options]) => fields.slug === 1 && options?.unique === true
      );
      assert.ok(hasUniqueSlug, 'MarketplaceListing must have unique index on slug');

      // Check sparse unique listingCode index
      const hasUniqueListingCode = listingIndexes.some(
        ([fields, options]) => fields.listingCode === 1 && options?.unique === true && options?.sparse === true
      );
      assert.ok(hasUniqueListingCode, 'MarketplaceListing must have sparse unique index on listingCode');

      // Check sellerId + status index
      const hasSellerStatus = listingIndexes.some(
        ([fields]) => fields.sellerId === 1 && fields.status === 1
      );
      assert.ok(hasSellerStatus, 'MarketplaceListing must index { sellerId: 1, status: 1 }');

      // Check status + category + createdAt index
      const hasStatusCategory = listingIndexes.some(
        ([fields]) => fields.status === 1 && fields.category === 1 && fields.createdAt === -1
      );
      assert.ok(hasStatusCategory, 'MarketplaceListing must index { status: 1, category: 1, createdAt: -1 }');

      // Check status + price index
      const hasStatusPrice = listingIndexes.some(
        ([fields]) => fields.status === 1 && fields.price === 1
      );
      assert.ok(hasStatusPrice, 'MarketplaceListing must index { status: 1, price: 1 }');

      // Check quizId reference index
      const hasQuizId = listingIndexes.some(([fields]) => fields.quizId === 1);
      assert.ok(hasQuizId, 'MarketplaceListing must index { quizId: 1 }');
    });

    it('verifies MarketplaceEntitlement compound uniqueness & fast lookup indexes', () => {
      const entitlementIndexes = MarketplaceEntitlement.schema.indexes();

      // Compound unique index on (userId, listingId)
      const hasUniqueUserListing = entitlementIndexes.some(
        ([fields, options]) => fields.userId === 1 && fields.listingId === 1 && options?.unique === true
      );
      assert.ok(hasUniqueUserListing, 'MarketplaceEntitlement must have compound unique index on { userId: 1, listingId: 1 }');

      // Fast lookup index on { userId: 1, 'contentRef.contentId': 1, status: 1 }
      const hasFastLookup = entitlementIndexes.some(
        ([fields]) => fields.userId === 1 && fields['contentRef.contentId'] === 1 && fields.status === 1
      );
      assert.ok(hasFastLookup, 'MarketplaceEntitlement must have fast lookup index on { userId: 1, contentRef.contentId: 1, status: 1 }');
    });

    it('verifies MarketplaceListingRevision compound unique index', () => {
      const revIndexes = MarketplaceListingRevision.schema.indexes();

      const hasUniqueRev = revIndexes.some(
        ([fields, options]) => fields.listingId === 1 && fields.revisionNumber === 1 && options?.unique === true
      );
      assert.ok(hasUniqueRev, 'MarketplaceListingRevision must have compound unique index on { listingId: 1, revisionNumber: 1 }');
    });

    it('verifies SellerProfile unique userId index', () => {
      const sellerIndexes = SellerProfile.schema.indexes();

      const hasUniqueUser = sellerIndexes.some(
        ([fields, options]) => fields.userId === 1 && options?.unique === true
      );
      assert.ok(hasUniqueUser, 'SellerProfile must have unique index on { userId: 1 }');
    });
  });

  // =========================================================================
  // 8. Milestone 4: Polymorphic contentRef, Educational Resource Ownership & Zero Duplication
  // =========================================================================
  describe('8. Milestone 4: Polymorphic contentRef & Educational Resource Integration', () => {
    const sampleUuid = '0192e471-2b0e-7448-b4da-4d76a7f80db4';
    const sampleSellerId = new mongoose.Types.ObjectId();

    describe('8.1 MarketplaceListing Polymorphic contentRef & Zero Duplication', () => {
      it('MarketplaceListing accepts UUID string IDs in contentRef.contentId for educational_resource', () => {
        const listing = new MarketplaceListing({
          slug: 'biochemistry-lecture-notes-pdf',
          title: 'Biochemistry Lecture Notes 2026',
          price: 19.99,
          sellerId: sampleSellerId,
          contentRef: {
            contentType: 'educational_resource',
            contentId: sampleUuid,
          },
        });

        const err = listing.validateSync();
        assert.equal(err, undefined, 'Listing with UUID contentId must pass validation');
        assert.equal(listing.contentType, 'educational_resource');
        assert.equal(listing.contentRef.contentId, sampleUuid);
        assert.equal(listing.contentRef.contentType, 'educational_resource');
        assert.equal(listing.contentRef.type, 'educational_resource');
        assert.equal(listing.quizId, undefined, 'quizId must remain undefined for non-quiz educational resources');
      });

      it('MarketplaceListing accepts type or contentType interchangeably in contentRef', () => {
        const listing = new MarketplaceListing({
          slug: 'cell-biology-atlas-bundle',
          title: 'Cell Biology Atlas Bundle',
          price: 29.99,
          sellerId: sampleSellerId,
          contentRef: {
            type: 'educational_resource',
            contentId: sampleUuid,
          },
        });

        const err = listing.validateSync();
        assert.equal(err, undefined);
        assert.equal(listing.contentType, 'educational_resource');
        assert.equal(listing.contentRef.contentType, 'educational_resource');
        assert.equal(listing.contentRef.type, 'educational_resource');
      });

      it('MarketplaceListing strictly forbids binary / raw file duplication fields', () => {
        const binaryForbiddenFields = [
          { fileBuffer: Buffer.from('fake pdf stream') },
          { rawBinary: Buffer.from([0x25, 0x50, 0x44, 0x46]) },
          { documentData: { pages: ['page 1 text', 'page 2 text'] } },
          { sheetData: [['Col1', 'Col2'], ['Val1', 'Val2']] },
        ];

        for (const payload of binaryForbiddenFields) {
          const fieldName = Object.keys(payload)[0];
          assert.throws(
            () => {
              const doc = new MarketplaceListing({
                slug: 'attempt-binary-duplication',
                title: 'Binary Duplication Attempt Pack',
                price: 15.0,
                sellerId: sampleSellerId,
                contentRef: {
                  contentType: 'educational_resource',
                  contentId: sampleUuid,
                },
                ...payload,
              });
              const err = doc.validateSync();
              if (err) throw err;
            },
            /Zero Duplication Invariant violation|strict mode|extraneous|Field `.*` is not in schema/i,
            `Expected injection of ${fieldName} to be rejected by schema`
          );
        }
      });

      it('Query normalization middleware matches legacy quizId queries against contentRef.contentId', () => {
        const fakeQuery = {
          filter: { quizId: sampleQuizId },
          getQuery() {
            return this.filter;
          },
        };

        normalizeQuizIdQuery.call(fakeQuery);

        assert.equal(fakeQuery.filter.quizId, undefined, 'Legacy quizId filter must be normalized');
        assert.ok(Array.isArray(fakeQuery.filter.$or), '$or clause must be constructed');
        assert.equal(fakeQuery.filter.$or.length, 2);
        assert.deepEqual(fakeQuery.filter.$or[0], { quizId: sampleQuizId });
        assert.equal(fakeQuery.filter.$or[1]['contentRef.contentType'], 'quiz');
        assert.ok(fakeQuery.filter.$or[1]['contentRef.contentId'].$in.some(
          (val) => val.toString() === sampleQuizId.toString()
        ));
      });
    });

    describe('8.2 MarketplaceEntitlement Polymorphic contentRef, Virtual quizId & Zero Duplication', () => {
      it('MarketplaceEntitlement accepts UUID string IDs in contentRef.contentId for educational_resource', () => {
        const entitlement = new MarketplaceEntitlement({
          userId: sampleUserId,
          listingId: sampleListingId,
          contentRef: {
            type: 'educational_resource',
            contentId: sampleUuid,
          },
        });

        const err = entitlement.validateSync();
        assert.equal(err, undefined, 'Entitlement with UUID contentId must pass validation');
        assert.equal(entitlement.contentRef.contentId, sampleUuid);
        assert.equal(entitlement.contentRef.type, 'educational_resource');
        assert.equal(entitlement.contentRef.contentType, 'educational_resource');
        assert.equal(entitlement.quizId, undefined, 'quizId virtual must be undefined for educational_resource');
      });

      it('MarketplaceEntitlement synchronizes type and contentType bidirectionally', () => {
        // When type is provided
        const entWithType = new MarketplaceEntitlement({
          userId: sampleUserId,
          listingId: sampleListingId,
          contentRef: {
            type: 'course',
            contentId: sampleQuizId,
          },
        });
        const err1 = entWithType.validateSync();
        assert.equal(err1, undefined);
        assert.equal(entWithType.contentRef.contentType, 'course');
        assert.equal(entWithType.contentRef.type, 'course');

        // When contentType is provided
        const entWithContentType = new MarketplaceEntitlement({
          userId: sampleUserId,
          listingId: sampleListingId,
          contentRef: {
            contentType: 'bundle',
            contentId: sampleQuizId,
          },
        });
        const err2 = entWithContentType.validateSync();
        assert.equal(err2, undefined);
        assert.equal(entWithContentType.contentRef.type, 'bundle');
        assert.equal(entWithContentType.contentRef.contentType, 'bundle');
      });

      it('MarketplaceEntitlement backward-compatibility quizId virtual getter and setter work and sync', () => {
        // Setting quizId directly creates or updates contentRef
        const entFromQuizId = new MarketplaceEntitlement({
          userId: sampleUserId,
          listingId: sampleListingId,
          quizId: sampleQuizId,
        });

        const err = entFromQuizId.validateSync();
        assert.equal(err, undefined);
        assert.equal(entFromQuizId.quizId.toString(), sampleQuizId.toString());
        assert.equal(entFromQuizId.contentRef.type, 'quiz');
        assert.equal(entFromQuizId.contentRef.contentType, 'quiz');
        assert.equal(entFromQuizId.contentRef.contentId.toString(), sampleQuizId.toString());

        // Setter updates existing contentRef
        const newQuizId = new mongoose.Types.ObjectId();
        entFromQuizId.quizId = newQuizId;
        assert.equal(entFromQuizId.quizId.toString(), newQuizId.toString());
        assert.equal(entFromQuizId.contentRef.contentId.toString(), newQuizId.toString());
      });

      it('MarketplaceEntitlement enforces strict: throw and rejects forbidden duplication fields', () => {
        const forbiddenFields = [
          { questions: [{ prompt: 'Q1' }] },
          { choices: ['A', 'B'] },
          { answers: ['A'] },
          { fileBuffer: Buffer.from('data') },
          { rawBinary: Buffer.from([0x00, 0x01]) },
          { documentData: { pages: 5 } },
          { sheetData: [['A']] },
        ];

        for (const payload of forbiddenFields) {
          const fieldName = Object.keys(payload)[0];
          assert.throws(
            () => {
              const doc = new MarketplaceEntitlement({
                userId: sampleUserId,
                listingId: sampleListingId,
                contentRef: {
                  type: 'educational_resource',
                  contentId: sampleUuid,
                },
                ...payload,
              });
              const err = doc.validateSync();
              if (err) throw err;
            },
            /Zero Duplication Invariant violation|strict mode|extraneous|Field `.*` is not in schema/i,
            `Expected injection of ${fieldName} into MarketplaceEntitlement to be rejected`
          );
        }
      });

      it('Entitlement query normalization middleware matches legacy quizId queries against contentRef', () => {
        const fakeQuery = {
          filter: { quizId: sampleQuizId },
          getQuery() {
            return this.filter;
          },
        };

        normalizeEntitlementQuizIdQuery.call(fakeQuery);

        assert.equal(fakeQuery.filter.quizId, undefined);
        assert.ok(Array.isArray(fakeQuery.filter.$or));
        assert.equal(fakeQuery.filter.$or.length, 2);
        assert.deepEqual(fakeQuery.filter.$or[0], { quizId: sampleQuizId });
      });
    });

    describe('8.3 Educational Resource Asset Ownership Validation (F12)', () => {
      const verifiedSellerId = new mongoose.Types.ObjectId();
      const otherSellerId = new mongoose.Types.ObjectId();
      const assetUuid = '0192e471-2b0e-7448-b4da-4d76a7f80db4';

      it('verifyEducationalAssetOwnership succeeds for valid owned ready asset with minimal projection', () => {
        const asset = {
          _id: assetUuid,
          ownerId: verifiedSellerId,
          status: 'ready',
          filename: 'pathology-notes.pdf',
          fileBuffer: Buffer.from('secret-pdf-data'),
          previewPages: [1, 2, 3],
        };

        const result = verifyEducationalAssetOwnership({ asset, sellerId: verifiedSellerId });
        assert.equal(result.allowed, true);
        assert.equal(result.assetId, assetUuid);
        assert.equal(result.sellerId, verifiedSellerId.toString());

        // Zero Leakage: Result must strictly contain ONLY allowed, assetId, sellerId
        assert.deepEqual(Object.keys(result).sort(), ['allowed', 'assetId', 'sellerId'].sort());
        assert.equal(result.filename, undefined);
        assert.equal(result.fileBuffer, undefined);
        assert.equal(result.previewPages, undefined);
      });

      it('verifyEducationalAssetOwnership rejects missing asset with RESOURCE_NOT_FOUND', () => {
        assert.throws(
          () => verifyEducationalAssetOwnership({ asset: null, sellerId: verifiedSellerId }),
          (err) => err instanceof OwnershipError && err.code === 'RESOURCE_NOT_FOUND'
        );
      });

      it('verifyEducationalAssetOwnership rejects missing sellerId with INVALID_SELLER_ID', () => {
        const asset = { _id: assetUuid, ownerId: verifiedSellerId, status: 'ready' };
        assert.throws(
          () => verifyEducationalAssetOwnership({ asset, sellerId: null }),
          (err) => err instanceof OwnershipError && err.code === 'INVALID_SELLER_ID'
        );
      });

      it('verifyEducationalAssetOwnership rejects unowned asset with FORBIDDEN_CONTENT_NOT_OWNED', () => {
        const asset = { _id: assetUuid, ownerId: otherSellerId, status: 'ready' };
        assert.throws(
          () => verifyEducationalAssetOwnership({ asset, sellerId: verifiedSellerId }),
          (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_CONTENT_NOT_OWNED'
        );
      });

      it('verifyEducationalAssetOwnership rejects non-ready asset (scanning, processing, quarantined, missing) with FORBIDDEN_ASSET_NOT_READY', () => {
        const nonReadyStatuses = ['scanning', 'processing', 'quarantined', 'failed', 'rejected', 'initiated', undefined, null];
        for (const status of nonReadyStatuses) {
          const asset = { _id: assetUuid, ownerId: verifiedSellerId, status };
          assert.throws(
            () => verifyEducationalAssetOwnership({ asset, sellerId: verifiedSellerId }),
            (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_ASSET_NOT_READY',
            `Expected status '${status}' to be rejected with FORBIDDEN_ASSET_NOT_READY`
          );
        }
      });

      it('verifyEducationalAssetOwnership rejects soft-deleted asset with FORBIDDEN_CONTENT_DELETED', () => {
        const deletedAsset = {
          _id: assetUuid,
          ownerId: verifiedSellerId,
          status: 'ready',
          deletedAt: new Date(),
        };
        assert.throws(
          () => verifyEducationalAssetOwnership({ asset: deletedAsset, sellerId: verifiedSellerId }),
          (err) => err instanceof OwnershipError && err.code === 'FORBIDDEN_CONTENT_DELETED'
        );
      });

      it('verifyEducationalAssetOwnershipWithDb queries mediaassets with minimal projection and succeeds for valid asset', async () => {
        let queriedCollection = null;
        let queryFilter = null;
        let queryProjection = null;

        const mockConnection = {
          db: {
            collection(name) {
              queriedCollection = name;
              return {
                async findOne(filter, options) {
                  queryFilter = filter;
                  queryProjection = options?.projection;
                  return {
                    _id: assetUuid,
                    ownerId: verifiedSellerId.toString(),
                    status: 'ready',
                    deletedAt: null,
                  };
                },
              };
            },
          },
        };

        const result = await verifyEducationalAssetOwnershipWithDb(assetUuid, verifiedSellerId, mockConnection);
        assert.equal(result.allowed, true);
        assert.equal(result.assetId, assetUuid);
        assert.equal(result.sellerId, verifiedSellerId.toString());
        assert.equal(queriedCollection, 'mediaassets');
        assert.deepEqual(queryProjection, { _id: 1, ownerId: 1, status: 1, deletedAt: 1 });
      });

      it('verifyEducationalAssetOwnershipWithDb rejects missing inputs and unowned database records', async () => {
        const mockConnection = {
          db: {
            collection() {
              return {
                async findOne() {
                  return null; // Asset not found
                },
              };
            },
          },
        };

        await assert.rejects(
          async () => verifyEducationalAssetOwnershipWithDb(null, verifiedSellerId, mockConnection),
          (err) => err instanceof OwnershipError && err.code === 'INVALID_INPUT'
        );

        await assert.rejects(
          async () => verifyEducationalAssetOwnershipWithDb(assetUuid, null, mockConnection),
          (err) => err instanceof OwnershipError && err.code === 'INVALID_INPUT'
        );

        await assert.rejects(
          async () => verifyEducationalAssetOwnershipWithDb(assetUuid, verifiedSellerId, mockConnection),
          (err) => err instanceof OwnershipError && err.code === 'RESOURCE_NOT_FOUND'
        );
      });
    });
  });
});
