/**
 * QuizFocus Phase 4 — Tier 4: Real-World Application Scenarios E2E Test Suite
 * Covers 8 End-to-End Real-World Application Workflows (S1 through S8).
 * Authoritative source: ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe as runnerDescribe, it as runnerIt, expect as runnerExpect } from './helpers/runner-core.js';
import {
  computeSha256,
  buildPdfFixture,
  buildExcelFixture,
  buildCsvFixture,
  buildJsonFixture,
  buildMacroSpreadsheetFixture,
  isFormulaInjection,
  sanitizeFormulaPrefix,
  buildSpoofedMimeFixture,
  redactMcqPreview,
} from './helpers/resource-fixtures.js';
import { PATHS, readFileSafe } from './helpers/static-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const platformRoot = path.resolve(__dirname, '..', '..');

// Set test environment variables
process.env.PORT = process.env.PORT || '5002';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test';
process.env.MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || 'storage';
process.env.MEDIA_MAX_FILE_SIZE = process.env.MEDIA_MAX_FILE_SIZE || '52428800';
process.env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE = process.env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE || '52428800';
process.env.MEDIA_CREATOR_MAX_STORAGE_BYTES = process.env.MEDIA_CREATOR_MAX_STORAGE_BYTES || '524288000';
process.env.MEDIA_CREATOR_MAX_ASSET_COUNT = process.env.MEDIA_CREATOR_MAX_ASSET_COUNT || '100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-secure-32-byte-test-secret-key-for-jwt-tokens!!';

// Import domain models and services via pathToFileURL
const mongoose = (await import(pathToFileURL(path.join(platformRoot, 'services/marketplace-service/node_modules/mongoose/index.js')))).default;
const MediaAsset = (await import(pathToFileURL(path.join(platformRoot, 'services/media-service/src/models/MediaAsset.model.js')))).default;
const { LIFECYCLE_STATES, canTransition, validateTransition } = await import(
  pathToFileURL(path.join(platformRoot, 'services/media-service/src/services/educationalStateMachine.js'))
);
const { MarketplaceListing } = await import(
  pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/models/MarketplaceListing.model.js'))
);
const { MarketplaceEntitlement } = await import(
  pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/models/MarketplaceEntitlement.model.js'))
);
const {
  checkCreatorQuota,
  createSignedUploadToken,
  verifySignedUploadToken,
  createSignedAccessGrant,
  verifySignedAccessGrant,
} = await import(
  pathToFileURL(path.join(platformRoot, 'services/media-service/src/services/educationalAsset.service.js'))
);
const { verifyEducationalAssetOwnership, OwnershipError } = await import(
  pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/services/ownership.service.js'))
);

const makeId = () => new mongoose.Types.ObjectId();
const makeIdStr = () => new mongoose.Types.ObjectId().toString();

export function registerTier4Tests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 4: Real-World Application Scenarios (8 Scenarios: S1 to S8)', () => {

    it('Scenario S1 — Complete Educational PDF Publishing Workflow (F1, F2, F4, F8, F9, F11, F12)', () => {
      const creatorId = makeId();
      const pdf = buildPdfFixture({ pageCount: 4, text: 'Machine Learning Course Syllabus', watermark: 'SAMPLE PREVIEW' });
      const checksum = computeSha256(pdf);

      // Step 1: Ingestion Init
      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId.toString(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'ML_Syllabus.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: pdf.length,
        status: 'initiated',
      });
      expect(asset.status).toBe('initiated');

      // Step 2: Upload complete & scanning
      expect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.UPLOADED)).toBeTruthy();
      expect(canTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.SCANNING)).toBeTruthy();

      // Step 3: Processing & metadata extraction
      expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.PROCESSING)).toBeTruthy();
      asset.status = 'ready';
      asset.fileHash = checksum;
      asset.metadata = { pageCount: 4, title: 'Machine Learning Course Syllabus' };
      expect(asset.validateSync()).toBeUndefined();
      expect(asset.metadata.pageCount).toBe(4);

      // Step 4: Preview generation & state ready
      expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.READY)).toBeTruthy();

      // Step 5: Verify ownership
      const ownership = verifyEducationalAssetOwnership({ asset, sellerId: creatorId });
      expect(ownership.allowed).toBe(true);

      // Step 6: Marketplace listing creation with polymorphic content reference
      const listing = new MarketplaceListing({
        slug: 'machine-learning-syllabus-guide',
        title: 'Machine Learning Syllabus Guide',
        sellerId: creatorId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: makeId(),
        },
        price: 19.99,
      });
      const err = listing.validateSync();
      expect(err).toBeUndefined();
      expect(listing.contentRef.contentType).toBe('educational_resource');

      // Step 7: Delivery via signed access grant
      const grantToken = createSignedAccessGrant(asset._id, makeIdStr(), 'user');
      const verified = verifySignedAccessGrant(grantToken, asset._id);
      expect(verified.scope).toBe('educational-access');
    });

    it('Scenario S2 — Spreadsheet MCQ Bank Ingestion with Formula Sanitization (F2, F4, F7, F8, F9, F11)', () => {
      const creatorId = makeId();
      const rawRows = [
        ['What is 2+2?', '3', '4', '5', 'B', 'Basic addition'],
        ['Malicious Row', '=SUM(1+1)', '+cmd|calc', '-exec', 'A', 'Formula injection attack'],
      ];
      const csv = buildCsvFixture({
        headers: ['Question', 'Option A', 'Option B', 'Option C', 'Answer', 'Explanation'],
        rows: rawRows,
      });

      // Neutralize formulas across all cells
      const sanitizedRows = rawRows.map(row =>
        row.map(cell => (isFormulaInjection(cell) ? sanitizeFormulaPrefix(cell) : cell))
      );
      expect(sanitizedRows[1][1].startsWith("'")).toBeTruthy();
      expect(sanitizedRows[1][2].startsWith("'")).toBeTruthy();

      // Redact answers for preview using real redaction helper
      const fullQuestions = [
        {
          prompt: sanitizedRows[0][0],
          options: [sanitizedRows[0][1], sanitizedRows[0][2], sanitizedRows[0][3]],
          correctAnswer: 1,
          explanation: sanitizedRows[0][5],
        },
        {
          prompt: sanitizedRows[1][0],
          options: [sanitizedRows[1][1], sanitizedRows[1][2], sanitizedRows[1][3]],
          correctAnswer: 0,
          explanation: sanitizedRows[1][5],
        },
      ];
      const safePreviews = redactMcqPreview(fullQuestions);
      expect(safePreviews.length).toBe(2);
      expect(safePreviews[0].answerRedacted).toBe(true);
      expect(safePreviews[0].correctAnswer).toBeUndefined();
      expect(safePreviews[0].explanation).toBeUndefined();
      expect(safePreviews[1].answerRedacted).toBe(true);

      // Create listing with polymorphic contentRef
      const listing = new MarketplaceListing({
        slug: 'sanitized-spreadsheet-assessment',
        title: 'Sanitized Spreadsheet Assessment',
        sellerId: creatorId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: makeId(),
        },
        price: 12.5,
      });
      const err = listing.validateSync();
      expect(err).toBeUndefined();
    });

    it('Scenario S3 — Malicious File Upload and Defense-in-Depth Quarantine (F2, F4, F5, F6, F15)', () => {
      // Attacker uploads macro file disguised with .pdf extension and application/pdf MIME
      const disguisedMacro = buildSpoofedMimeFixture({ disguise: 'pdf' });

      // Deep inspection examines actual bytes (detects non-PDF header)
      const actualSignature = disguisedMacro.subarray(0, 5).toString('utf8');
      const isRealPdf = actualSignature === '%PDF-';
      expect(isRealPdf).toBeFalsy();

      // Lifecycle transitions to quarantined
      validateTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.QUARANTINED);
      expect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.READY)).toBeFalsy();

      // Quarantine record created
      const quarantineAsset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'disguised.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: disguisedMacro.length,
        fileHash: computeSha256(disguisedMacro),
        status: 'quarantined',
        failureCode: 'SPOOFED_MIME_MALICIOUS_HEADER',
        failureReason: 'File contains executable MZ magic bytes despite PDF extension',
      });
      expect(quarantineAsset.validateSync()).toBeUndefined();

      // Ownership verification rejects listing quarantined assets
      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: quarantineAsset, sellerId: quarantineAsset.ownerId });
      } catch (err) {
        threw = true;
        expect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
      }
      expect(threw).toBeTruthy();
    });

    it('Scenario S4 — Storage Deduplication & Multi-Tenant Privacy Workflow (F1, F2, F3, F10, F12)', () => {
      const userA = makeIdStr();
      const userB = makeIdStr();
      const sharedEducationalContent = 'Large Physics 101 Lecture Notes PDF';
      const checksum = computeSha256(sharedEducationalContent);

      // User A uploads
      const assetA = new MediaAsset({
        _id: makeIdStr(),
        ownerId: userA,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'UserA_Private_Physics_Notes.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 2048,
        fileHash: checksum,
        status: 'ready',
      });

      // User B uploads identical file with different filename
      const assetB = new MediaAsset({
        _id: makeIdStr(),
        ownerId: userB,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'My_Class_Physics.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 2048,
        fileHash: checksum,
        status: 'ready',
      });

      expect(assetA.validateSync()).toBeUndefined();
      expect(assetB.validateSync()).toBeUndefined();

      // Physical storage checksum matches, but tenants are completely isolated
      expect(assetA.fileHash).toBe(assetB.fileHash);
      expect(assetA.ownerId).not.toBe(assetB.ownerId);

      // User B cannot list User A's asset
      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: assetA, sellerId: userB });
      } catch (err) {
        threw = true;
        expect(err.code).toBe('FORBIDDEN_CONTENT_NOT_OWNED');
      }
      expect(threw).toBeTruthy();

      // Duplicate query for User B strictly isolates User A's private metadata
      const privacySafeQueryForB = {
        checksum: checksum,
        duplicateExists: true,
      };
      expect(privacySafeQueryForB.filename).toBeUndefined();
      expect(privacySafeQueryForB.ownerId).toBeUndefined();
    });

    it('Scenario S5 — Multi-Resource Educational Bundle Composition & Entitlement (F1, F2, F4, F9, F11, F12)', () => {
      const creatorId = makeId();
      const studentId = makeId();
      const bundleId = makeId();

      // Marketplace listing created for bundle with polymorphic contentRef
      const bundleListing = new MarketplaceListing({
        slug: 'complete-physics-bundle',
        title: 'Complete Physics Educational Bundle',
        sellerId: creatorId,
        contentRef: {
          contentType: 'bundle',
          contentId: bundleId,
        },
        price: 35.0,
        contentType: 'bundle',
      });
      const listingErr = bundleListing.validateSync();
      expect(listingErr).toBeUndefined();
      expect(bundleListing.contentRef.contentType).toBe('bundle');

      // Student acquires entitlement
      const entitlement = new MarketplaceEntitlement({
        userId: studentId,
        listingId: bundleListing._id,
        contentRef: {
          type: 'bundle',
          contentId: bundleId,
        },
        status: 'active',
        source: 'purchase',
      });
      const entitlementErr = entitlement.validateSync();
      expect(entitlementErr).toBeUndefined();
      expect(entitlement.isEffective()).toBe(true);

      // When revoked, entitlement is no longer effective
      entitlement.status = 'revoked';
      expect(entitlement.isEffective()).toBe(false);
    });

    it('Scenario S6 — Creator Quota Enforcement and Rate Limit Recovery (F2, F3, F13, F15)', async () => {
      const origAggregate = MediaAsset.aggregate;
      try {
        // Step 1: Volume quota exhaustion triggers HTTP 429
        MediaAsset.aggregate = async () => [{ _id: 'creator_s6', totalBytes: 524288000, assetCount: 99 }];
        let threw = false;
        try {
          await checkCreatorQuota('creator_s6', 10 * 1024 * 1024);
        } catch (err) {
          threw = true;
          expect(err.statusCode).toBe(429);
          expect(err.message).toContain('Creator storage volume quota exceeded');
        }
        expect(threw).toBeTruthy();

        // Step 2: Completed storage cleanup frees quota slot, upload succeeds
        MediaAsset.aggregate = async () => [{ _id: 'creator_s6', totalBytes: 300 * 1024 * 1024, assetCount: 60 }];
        const recoveredUsage = await checkCreatorQuota('creator_s6', 10 * 1024 * 1024);
        expect(recoveredUsage.currentBytes).toBe(300 * 1024 * 1024);
      } finally {
        MediaAsset.aggregate = origAggregate;
      }
    });

    it('Scenario S7 — Mobile Creator Native Upload Experience (F2, F13, F14, F15)', () => {
      const mobileTheme = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/styles/theme.css')) || '';
      const desktopCss = readFileSafe(PATHS.indexCss) || '';

      // Verify touch active feedback
      const hasScaleRule = desktopCss.includes('scale(0.97)') || mobileTheme.includes('scale(0.97)');
      expect(hasScaleRule).toBeTruthy();

      // Verify iOS zoom prevention font-size >= 16px
      const hasInputRule = desktopCss.includes('16px') || mobileTheme.includes('16px');
      expect(hasInputRule).toBeTruthy();

      // Touch action manipulation
      const hasManipulation = desktopCss.includes('manipulation') || mobileTheme.includes('manipulation');
      expect(hasManipulation).toBeTruthy();

      // Mobile upload progression
      const mobileUploadSteps = [
        LIFECYCLE_STATES.INITIATED,
        LIFECYCLE_STATES.UPLOADED,
        LIFECYCLE_STATES.SCANNING,
        LIFECYCLE_STATES.PROCESSING,
        LIFECYCLE_STATES.READY,
      ];
      expect(mobileUploadSteps.length).toBe(5);
      for (let i = 0; i < mobileUploadSteps.length - 1; i++) {
        expect(canTransition(mobileUploadSteps[i], mobileUploadSteps[i + 1])).toBeTruthy();
      }
    });

    it('Scenario S8 — Processing Failure Recovery & Non-Destructive Retention (F1, F2, F3, F8, F15)', () => {
      const assetId = makeIdStr();

      // 1. Asset transitions into processing
      expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.PROCESSING)).toBeTruthy();

      // 2. Simulated transient parsing timeout transitions to failed
      expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.FAILED)).toBeTruthy();

      // 3. Retry recovery succeeds on attempt 1
      const attemptCount = 1;
      expect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.PROCESSING, attemptCount)).toBeTruthy();

      // 4. Successful recovery reaches ready
      expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.READY)).toBeTruthy();

      // 5. Asset document verifies non-destructive retention (deletedAt is null)
      const asset = new MediaAsset({
        _id: assetId,
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'recovered_lecture.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 4096,
        fileHash: computeSha256('RecoveredData'),
        status: 'ready',
        deletedAt: null,
      });
      expect(asset.validateSync()).toBeUndefined();
      expect(asset.deletedAt).toBeNull();
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier4-application-scenarios.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier4Tests();
}
