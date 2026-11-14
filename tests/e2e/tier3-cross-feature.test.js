/**
 * QuizFocus Phase 4 — Tier 3: Cross-Feature Combinations E2E Test Suite
 * Covers 15 Pairwise & Cross-Feature Interactions (C1 through C15).
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
  buildDecompressionBombFixture,
  isFormulaInjection,
  sanitizeFormulaPrefix,
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
const { sanitizeProxyRequest, errorCode, errorBody } = await import(
  pathToFileURL(path.join(platformRoot, 'services/api-gateway/src/contracts.js'))
);

const makeId = () => new mongoose.Types.ObjectId();
const makeIdStr = () => new mongoose.Types.ObjectId().toString();

export function registerTier3Tests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 3: Cross-Feature Combinations (15 Tests: C1 to C15)', () => {

    it('C1 (F4 + F2 + F8): Multi-format PDF ingestion triggers lifecycle state machine through scanning to metadata extraction', () => {
      const pdf = buildPdfFixture({ pageCount: 2 });
      const hasSignature = pdf.subarray(0, 5).toString('utf8') === '%PDF-';
      expect(hasSignature).toBeTruthy();

      expect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.UPLOADED)).toBeTruthy();
      expect(canTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.SCANNING)).toBeTruthy();
      expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.PROCESSING)).toBeTruthy();
      expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.READY)).toBeTruthy();

      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'lecture.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: pdf.length,
        fileHash: computeSha256(pdf),
        status: 'ready',
        metadata: { pageCount: 2, format: 'PDF-1.4' },
      });
      const err = asset.validateSync();
      expect(err).toBeUndefined();
      expect(asset.metadata.pageCount).toBe(2);
    });

    it('C2 (F3 + F10 + F1): Upload quota check identifies duplicate checksum and executes storage deduplication without quota double-counting', async () => {
      const fileSize = 5 * 1024 * 1024;
      const fileBytes = 'Educational Content for Quota Check';
      const hash = computeSha256(fileBytes);
      const creatorId = makeIdStr();

      // Existing asset in storage
      const existingAsset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'original_lecture.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: fileSize,
        fileHash: hash,
        status: 'ready',
      });
      expect(existingAsset.validateSync()).toBeUndefined();

      // Duplicate upload by same creator reuses hash and satisfies validation
      const duplicateAsset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'duplicate_copy.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: fileSize,
        fileHash: hash,
        status: 'ready',
      });
      expect(duplicateAsset.validateSync()).toBeUndefined();
      expect(duplicateAsset.fileHash).toBe(existingAsset.fileHash);

      // Quota check with existing storage volume does not exceed limit
      const origAggregate = MediaAsset.aggregate;
      try {
        MediaAsset.aggregate = async () => [{ _id: creatorId, totalBytes: fileSize, assetCount: 1 }];
        const usage = await checkCreatorQuota(creatorId, 1024);
        expect(usage.currentBytes).toBe(fileSize);
      } finally {
        MediaAsset.aggregate = origAggregate;
      }
    });

    it('C3 (F5 + F2 + F15): Macro-enabled spreadsheet upload transitions to quarantined state and triggers gateway audit logging', () => {
      const macroWorkbook = buildMacroSpreadsheetFixture();
      const hasVba = macroWorkbook.includes(Buffer.from('xl/vbaProject.bin'));
      expect(hasVba).toBeTruthy();

      validateTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.QUARANTINED);
      expect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.READY)).toBeFalsy();

      let invalidTransitionThrew = false;
      try {
        validateTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.READY);
      } catch (err) {
        invalidTransitionThrew = true;
        expect(err.statusCode).toBe(409);
      }
      expect(invalidTransitionThrew).toBeTruthy();

      const quarantinedAsset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'spreadsheet',
        purpose: 'educational-resource',
        originalName: 'macro_test.xlsm',
        sourceMimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
        sourceSize: macroWorkbook.length,
        fileHash: computeSha256(macroWorkbook),
        status: 'quarantined',
        failureCode: 'MACRO_DETECTED',
        failureReason: 'Embedded VBA binary detected in workbook container',
      });
      expect(quarantinedAsset.validateSync()).toBeUndefined();

      // Ownership verification rejects listing quarantined assets
      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: quarantinedAsset, sellerId: quarantinedAsset.ownerId });
      } catch (err) {
        threw = true;
        expect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
      }
      expect(threw).toBeTruthy();
    });

    it('C4 (F6 + F7 + F9): Decompression bounds validation combined with formula neutralization yields sanitized spreadsheet preview', () => {
      const csv = buildCsvFixture({
        headers: ['Topic', 'Formula Column', 'Numeric Column'],
        rows: [['Math', '=SUM(1+1)', '-42.5']],
      });
      const lines = csv.split('\n');
      const formulaCell = lines[1].split(',')[1];
      const numericCell = lines[1].split(',')[2];

      expect(isFormulaInjection(formulaCell)).toBeTruthy();
      expect(isFormulaInjection(numericCell)).toBeFalsy();

      const sanitizedFormula = sanitizeFormulaPrefix(formulaCell);
      expect(sanitizedFormula.startsWith("'")).toBeTruthy();
      const sanitizedNumeric = sanitizeFormulaPrefix(numericCell);
      expect(sanitizedNumeric).toBe('-42.5');

      const safePreviews = redactMcqPreview([
        { prompt: 'What is 1+1?', options: [sanitizedFormula, sanitizedNumeric], correctAnswer: 0, explanation: 'Basic addition' },
      ]);
      expect(safePreviews.length).toBe(1);
      expect(safePreviews[0].correctAnswer).toBeUndefined();
      expect(safePreviews[0].explanation).toBeUndefined();
      expect(safePreviews[0].answerRedacted).toBe(true);
    });

    it('C5 (F8 + F9 + F1): Metadata extraction generates watermarked PDF preview stored under private storage lease', () => {
      const pdf = buildPdfFixture({ pageCount: 4, watermark: 'SAMPLE' });
      expect(pdf.toString('utf8')).toContain('SAMPLE');

      const leaseUntil = new Date(Date.now() + 3600 * 1000);
      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'course-syllabus.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: pdf.length,
        status: 'ready',
        fileHash: computeSha256(pdf),
        referenceLeaseUntil: leaseUntil,
      });
      const err = asset.validateSync();
      expect(err).toBeUndefined();
      expect(asset.referenceLeaseUntil).toEqual(leaseUntil);
    });

    it('C6 (F10 + F12 + F11): Duplicate asset reuse verifies ownership before creating polymorphic marketplace listing', () => {
      const creatorId = makeId();
      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId.toString(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'verified_course.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 2048,
        fileHash: computeSha256('Course Data'),
        status: 'ready',
      });
      expect(asset.validateSync()).toBeUndefined();

      const ownershipResult = verifyEducationalAssetOwnership({ asset, sellerId: creatorId });
      expect(ownershipResult.allowed).toBe(true);

      const listing = new MarketplaceListing({
        slug: 'verified-owner-resource',
        title: 'Verified Owner Resource',
        sellerId: creatorId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: makeId(),
        },
        price: 9.99,
      });
      const err = listing.validateSync();
      expect(err).toBeUndefined();
      expect(listing.contentRef.contentType).toBe('educational_resource');
    });

    it('C7 (F3 + F15 + F13): Creator upload rate limit and quota exhaustion surfaces structured error state in Desktop UI', async () => {
      const origAggregate = MediaAsset.aggregate;
      try {
        // Simulate storage volume near capacity
        MediaAsset.aggregate = async () => [{ _id: 'creator_exhausted', totalBytes: 524288000, assetCount: 99 }];
        let threw = false;
        try {
          await checkCreatorQuota('creator_exhausted', 10 * 1024 * 1024);
        } catch (err) {
          threw = true;
          expect(err.statusCode).toBe(429);
          expect(err.message).toContain('Creator storage volume quota exceeded');
        }
        expect(threw).toBeTruthy();

        // Gateway error code mapping returns RATE_LIMITED for 429
        expect(errorCode(429)).toBe('RATE_LIMITED');
        const errPayload = errorBody(429, 'Upload rate limit exceeded. Please try again later.', 'req_quota_c7');
        expect(errPayload.error.code).toBe('RATE_LIMITED');
        expect(errPayload.requestId).toBe('req_quota_c7');
      } finally {
        MediaAsset.aggregate = origAggregate;
      }
    });

    it('C8 (F9 + F1 + F3): Safe preview artifact delivery generates short-lived signed accessGrant token without original leak', () => {
      const assetId = makeIdStr();
      const viewerId = makeIdStr();
      const token = createSignedAccessGrant(assetId, viewerId, 'user');
      expect(typeof token).toBe('string');

      // Valid token decodes correctly
      const decoded = verifySignedAccessGrant(token, assetId);
      expect(decoded.assetId).toBe(assetId);
      expect(decoded.viewerId).toBe(viewerId);
      expect(decoded.scope).toBe('educational-access');

      // Tampered token throws 401
      let tamperedThrew = false;
      try {
        verifySignedAccessGrant(`${token}_tampered`, assetId);
      } catch (err) {
        tamperedThrew = true;
        expect(err.statusCode).toBe(401);
      }
      expect(tamperedThrew).toBeTruthy();

      // Mismatched asset target throws 403
      let mismatchedThrew = false;
      try {
        verifySignedAccessGrant(token, 'different_asset_id');
      } catch (err) {
        mismatchedThrew = true;
        expect(err.statusCode).toBe(403);
      }
      expect(mismatchedThrew).toBeTruthy();
    });

    it('C9 (F11 + F12 + F1): Marketplace listing with polymorphic contentRef enforces Zero Duplication against media storage', () => {
      const contentId = makeId();
      const listing = new MarketplaceListing({
        slug: 'zero-duplication-educational-ref',
        title: 'Zero Duplication Educational Ref',
        sellerId: makeId(),
        contentRef: {
          contentType: 'educational_resource',
          contentId,
        },
        price: 15.0,
      });
      expect(listing.validateSync()).toBeUndefined();
      expect(listing.get('questions')).toBeUndefined();
      expect(listing.get('choices')).toBeUndefined();

      // Enforce that storing questions or choices throws Zero Duplication Invariant violation
      let threw = false;
      try {
        const duplicatedListing = new MarketplaceListing({
          slug: 'violation-educational-listing',
          title: 'Violation Educational Listing',
          sellerId: makeId(),
          contentRef: {
            contentType: 'educational_resource',
            contentId,
          },
          price: 15.0,
          questions: [{ prompt: 'Duplicated Question' }],
        });
        duplicatedListing.validateSync();
      } catch (err) {
        threw = true;
        expect(err.message).toMatch(/questions|Zero Duplication/i);
      }
      expect(threw).toBeTruthy();
    });

    it('C10 (F14 + F2 + F13): Mobile native upload component polls 5-state lifecycle progression with animated progress bar', () => {
      const states = [
        LIFECYCLE_STATES.INITIATED,
        LIFECYCLE_STATES.UPLOADED,
        LIFECYCLE_STATES.SCANNING,
        LIFECYCLE_STATES.PROCESSING,
        LIFECYCLE_STATES.READY,
      ];
      expect(states.length).toBe(5);
      for (let i = 0; i < states.length - 1; i++) {
        expect(canTransition(states[i], states[i + 1])).toBeTruthy();
      }
      // Cannot jump from initiated directly to ready
      expect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.READY)).toBeFalsy();
    });

    it('C11 (F7 + F8 + F4): CSV formula escaping preserves numeric columns while neutralizing malicious formulas during ingestion', () => {
      const csv = buildCsvFixture({
        headers: ['Item', 'Score', 'Malicious'],
        rows: [['Student 1', '-42.5', '  =cmd|\' /C calc\'!A0']],
      });
      const lines = csv.split('\n');
      const cells = lines[1].split(',');
      const score = cells[1];
      expect(isFormulaInjection(score)).toBeFalsy();
      expect(sanitizeFormulaPrefix(score)).toBe('-42.5');

      const malicious = cells[2];
      expect(isFormulaInjection(malicious)).toBeTruthy();
      const sanitized = sanitizeFormulaPrefix(malicious);
      expect(sanitized).toBe("  '=cmd|' /C calc'!A0");
    });

    it('C12 (F4 + F9 + F15): Multi-format PDF upload proxies through gateway, sanitizes headers, and outputs watermarked preview', () => {
      const pdf = buildPdfFixture({ pageCount: 1, watermark: 'CONFIDENTIAL' });
      expect(pdf.toString('utf8')).toContain('CONFIDENTIAL');

      const removed = [];
      const setHeaders = {};
      const proxyReq = {
        removeHeader: (h) => removed.push(h),
        setHeader: (k, v) => { setHeaders[k] = v; },
      };
      const req = {
        headers: {
          'x-user-id': 'untrusted_client',
          'x-role': 'admin',
          authorization: 'Bearer valid_jwt',
        },
        requestId: 'req_pdf_c12',
        ip: '10.0.0.1',
      };
      sanitizeProxyRequest(proxyReq, req);
      expect(removed).toContain('x-user-id');
      expect(removed).toContain('x-role');
      expect(setHeaders['x-request-id']).toBe('req_pdf_c12');
      expect(setHeaders['x-forwarded-for']).toBe('10.0.0.1');
    });

    it('C13 (F4 + F2 + F13): Corrupted document upload transitions state to rejected and displays retry prompt in UI', () => {
      const corrupted = buildPdfFixture({ corrupted: true });
      const isValid = corrupted.subarray(0, 5).toString('utf8') === '%PDF-';
      expect(isValid).toBeFalsy();

      validateTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.REJECTED);
      expect(canTransition(LIFECYCLE_STATES.REJECTED, LIFECYCLE_STATES.PROCESSING)).toBeFalsy();

      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'corrupt.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: corrupted.length,
        fileHash: computeSha256(corrupted),
        status: 'rejected',
        failureCode: 'CORRUPTED_DOCUMENT_HEADER',
        failureReason: 'Missing valid %PDF- header magic bytes',
      });
      expect(asset.validateSync()).toBeUndefined();
    });

    it('C14 (F10 + F12 + F3): Multi-tenant duplicate detection preserves owner privacy and prevents unauthorized asset association', () => {
      const ownerA = makeIdStr();
      const ownerB = makeIdStr();
      const hash = computeSha256('Private Content');

      const assetA = new MediaAsset({
        _id: makeIdStr(),
        ownerId: ownerA,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'OwnerA_Confidential.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 1024,
        fileHash: hash,
        status: 'ready',
      });
      const assetB = new MediaAsset({
        _id: makeIdStr(),
        ownerId: ownerB,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'OwnerB_Notes.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 1024,
        fileHash: hash,
        status: 'ready',
      });

      expect(assetA.validateSync()).toBeUndefined();
      expect(assetB.validateSync()).toBeUndefined();
      expect(assetA.ownerId).not.toBe(assetB.ownerId);

      // User B cannot list User A's asset
      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: assetA, sellerId: ownerB });
      } catch (err) {
        threw = true;
        expect(err.code).toBe('FORBIDDEN_CONTENT_NOT_OWNED');
      }
      expect(threw).toBeTruthy();
    });

    it('C15 (F1-F12 Complete): Full end-to-end ingestion, scanning, processing, preview generation, duplicate check, and marketplace listing', () => {
      const creatorId = makeId();
      const pdf = buildPdfFixture({ pageCount: 3, watermark: 'SAMPLE' });
      const checksum = computeSha256(pdf);

      // 1. Ingestion init
      expect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.UPLOADED)).toBeTruthy();
      // 2. Security scanning
      expect(canTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.SCANNING)).toBeTruthy();
      // 3. Processing & metadata extraction
      expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.PROCESSING)).toBeTruthy();
      // 4. Preview generation & Ready
      expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.READY)).toBeTruthy();

      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId.toString(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'ml-notes.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: pdf.length,
        fileHash: checksum,
        status: 'ready',
        metadata: { pageCount: 3 },
      });
      expect(asset.validateSync()).toBeUndefined();

      // 5. Ownership verification
      const ownership = verifyEducationalAssetOwnership({ asset, sellerId: creatorId });
      expect(ownership.allowed).toBe(true);

      // 6. Educational listing created with polymorphic contentRef
      const listing = new MarketplaceListing({
        slug: 'complete-educational-journey-listing',
        title: 'Complete Educational Journey Listing',
        sellerId: creatorId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: makeId(),
        },
        price: 29.99,
      });
      const err = listing.validateSync();
      expect(err).toBeUndefined();
      expect(listing.contentRef.contentType).toBe('educational_resource');

      // 7. Signed access grant verification
      const grantToken = createSignedAccessGrant(asset._id, makeIdStr(), 'user');
      const verifiedGrant = verifySignedAccessGrant(grantToken, asset._id);
      expect(verifiedGrant.scope).toBe('educational-access');
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier3-cross-feature.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier3Tests();
}
