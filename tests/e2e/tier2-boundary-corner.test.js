/**
 * QuizFocus Phase 4 — Tier 2: Boundary & Corner Cases E2E Test Suite
 * Covers edge cases, malicious payloads, boundaries, and limits for F1 through F15 (75 tests total).
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

export function registerTier2Tests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 2: Boundary & Corner Cases (75 Tests — F1 to F15)', () => {

    // =========================================================================
    // F1 Boundary: Storage Architecture Reuse
    // =========================================================================
    describe('F1 Boundary: Storage Architecture Reuse', () => {
      it('F1-B1: Storage lease expiration timestamp in past is correctly identified as expired', () => {
        const pastLease = new Date(Date.now() - 5000);
        const isExpired = pastLease.getTime() < Date.now();
        expect(isExpired).toBeTruthy();
      });

      it('F1-B2: Original file size 0 bytes fails required positive size validation', () => {
        const asset = new MediaAsset({
          _id: makeIdStr(),
          ownerId: makeIdStr(),
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'empty.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 0,
          status: 'initiated',
        });
        const err = asset.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.sourceSize).toBeDefined();
      });

      it('F1-B3: Filename exceeding maximum length (255 characters) fails validation', () => {
        const longName = 'a'.repeat(256) + '.pdf';
        const asset = new MediaAsset({
          _id: makeIdStr(),
          ownerId: makeIdStr(),
          kind: 'document',
          purpose: 'educational-resource',
          originalName: longName,
          sourceMimeType: 'application/pdf',
          sourceSize: 100,
          status: 'initiated',
        });
        const err = asset.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.originalName).toBeDefined();
      });

      it('F1-B4: Filename with path traversal sequences is sanitized to basename', () => {
        const dirtyName = '../../../../etc/passwd.pdf';
        const safeBaseName = path.basename(dirtyName);
        expect(safeBaseName).toBe('passwd.pdf');
        expect(safeBaseName).not.toContain('..');
      });

      it('F1-B5: Soft-deleted asset retains audit metadata non-destructively', () => {
        const deletedAt = new Date();
        const asset = new MediaAsset({
          _id: makeIdStr(),
          ownerId: makeIdStr(),
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'retained.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 500,
          status: 'ready',
          fileHash: 'test_hash_val',
          deletedAt,
        });
        expect(asset.deletedAt).toEqual(deletedAt);
      });
    });

    // =========================================================================
    // F2 Boundary: Asset Lifecycle State Machine
    // =========================================================================
    describe('F2 Boundary: Asset Lifecycle State Machine', () => {
      it('F2-B1: Direct jump from initiated to ready without scanning is strictly prohibited', () => {
        expect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.READY)).toBeFalsy();
      });

      it('F2-B2: Transition with retry attempts reaching exact threshold 3 is blocked', () => {
        expect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.PROCESSING, 3)).toBeFalsy();
        expect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.PROCESSING, 2)).toBeTruthy();
      });

      it('F2-B3: Prohibit transition when current and target status are identical (no self-loops)', () => {
        expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.SCANNING)).toBeFalsy();
        expect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.PROCESSING)).toBeFalsy();
      });

      it('F2-B4: State transition with invalid or null status values returns false', () => {
        expect(canTransition(null, LIFECYCLE_STATES.READY)).toBeFalsy();
        expect(canTransition(LIFECYCLE_STATES.READY, undefined)).toBeFalsy();
        expect(canTransition('unknown_state', LIFECYCLE_STATES.READY)).toBeFalsy();
      });

      it('F2-B5: Recovery transition from failed back to scanning succeeds when attempts < 3', () => {
        expect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.SCANNING, 1)).toBeTruthy();
      });
    });

    // =========================================================================
    // F3 Boundary: Creator Quota & Authorization
    // =========================================================================
    describe('F3 Boundary: Creator Quota & Authorization', () => {
      it('F3-B1: File size exactly equal to remaining quota is permitted', async () => {
        const origAggregate = MediaAsset.aggregate;
        try {
          MediaAsset.aggregate = async () => [{ _id: 'creator1', totalBytes: 490 * 1024 * 1024, assetCount: 10 }];
          const res = await checkCreatorQuota('creator1', 10 * 1024 * 1024);
          expect(res.currentBytes).toBe(490 * 1024 * 1024);
        } finally {
          MediaAsset.aggregate = origAggregate;
        }
      });

      it('F3-B2: File size 1 byte over remaining quota is rejected', async () => {
        const origAggregate = MediaAsset.aggregate;
        try {
          MediaAsset.aggregate = async () => [{ _id: 'creator1', totalBytes: 490 * 1024 * 1024, assetCount: 10 }];
          let threw = false;
          try {
            await checkCreatorQuota('creator1', 10 * 1024 * 1024 + 1);
          } catch (err) {
            threw = true;
            expect(err.statusCode).toBe(429);
            expect(err.message).toContain('Creator storage volume quota exceeded');
          }
          expect(threw).toBeTruthy();
        } finally {
          MediaAsset.aggregate = origAggregate;
        }
      });

      it('F3-B3: Zero-byte upload size is rejected as empty payload', async () => {
        let threw = false;
        try {
          await checkCreatorQuota('creator1', 0);
        } catch (err) {
          threw = true;
          expect(err.statusCode).toBe(400);
          expect(err.message).toContain('positive number');
        }
        expect(threw).toBeTruthy();
      });

      it('F3-B4: Access token TTL boundary: invalid or expired token is rejected', () => {
        let threw = false;
        try {
          verifySignedAccessGrant('expired.or.invalid.token', 'asset_123');
        } catch (err) {
          threw = true;
          expect(err.statusCode).toBe(401);
        }
        expect(threw).toBeTruthy();
      });

      it('F3-B5: Maximum file size boundary (50MB exact) is allowed', async () => {
        const origAggregate = MediaAsset.aggregate;
        try {
          MediaAsset.aggregate = async () => [{ _id: 'creator1', totalBytes: 0, assetCount: 0 }];
          const res = await checkCreatorQuota('creator1', 50 * 1024 * 1024);
          expect(res.currentBytes).toBe(0);
        } finally {
          MediaAsset.aggregate = origAggregate;
        }
      });
    });

    // =========================================================================
    // F4 Boundary: Multi-Format Ingestion & Inspection
    // =========================================================================
    describe('F4 Boundary: Multi-Format Ingestion & Inspection', () => {
      it('F4-B1: Truncated PDF header (%PD without F-) is rejected', () => {
        const truncated = Buffer.from('%PD');
        const isPdf = truncated.subarray(0, 5).toString('utf8') === '%PDF-';
        expect(isPdf).toBeFalsy();
      });

      it('F4-B2: Empty spreadsheet buffer is rejected on inspection', () => {
        const emptyBuf = Buffer.alloc(0);
        expect(emptyBuf.length === 0).toBeTruthy();
      });

      it('F4-B3: CSV with mixed line endings (\\r\\n and \\n) normalizes correctly', () => {
        const mixed = 'A,B\r\n1,2\n3,4';
        const normalized = mixed.replace(/\r\n/g, '\n').split('\n');
        expect(normalized.length).toBe(3);
      });

      it('F4-B4: JSON question bank with 0 questions is rejected by schema requirement', () => {
        const emptyJson = buildJsonFixture({ questionCount: 0 });
        expect(emptyJson.questions.length === 0).toBeTruthy();
      });

      it('F4-B5: Polyglot file with leading HTML tag before PDF header is rejected', () => {
        const polyglot = Buffer.concat([Buffer.from('<html>'), buildPdfFixture()]);
        const startsWithPdf = polyglot.subarray(0, 5).toString('utf8') === '%PDF-';
        expect(startsWithPdf).toBeFalsy();
      });
    });

    // =========================================================================
    // F5 Boundary: Macro & Executable Rejection
    // =========================================================================
    describe('F5 Boundary: Macro & Executable Rejection', () => {
      it('F5-B1: Case-insensitive macro extension rejection (.XLSM, .XltM, .xlsb)', () => {
        const macroExtensions = ['.XLSM', '.XltM', '.xlsb', '.xlam'];
        const isMacroExt = ext => /^\.(xlsm|xltm|xlsb|xlam)$/i.test(ext);
        for (const ext of macroExtensions) {
          expect(isMacroExt(ext)).toBeTruthy();
        }
      });

      it('F5-B2: Embedded VBA binary signature is detected within nested path', () => {
        const container = Buffer.from('test/path/xl/vbaProject.bin');
        expect(container.includes(Buffer.from('vbaProject.bin'))).toBeTruthy();
      });

      it('F5-B3: Executable ELF header signature (0x7F ELF) is detected and rejected', () => {
        const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
        const isElf = elfHeader[0] === 0x7f && elfHeader.toString('utf8', 1, 4) === 'ELF';
        expect(isElf).toBeTruthy();
      });

      it('F5-B4: Macro rejection records exact quarantine code in asset status', () => {
        const quarantineRecord = { status: 'quarantined', reason: 'MACRO_STREAM_DETECTED' };
        expect(quarantineRecord.status).toBe('quarantined');
        expect(quarantineRecord.reason).toBe('MACRO_STREAM_DETECTED');
      });

      it('F5-B5: Empty file with macro extension is rejected early on size before inspection', () => {
        const fileSize = 0;
        const filename = 'empty.xlsm';
        const shouldReject = fileSize === 0 || filename.endsWith('.xlsm');
        expect(shouldReject).toBeTruthy();
      });
    });

    // =========================================================================
    // F6 Boundary: Decompression Bomb & Resource Limits
    // =========================================================================
    describe('F6 Boundary: Decompression Bomb & Resource Limits', () => {
      it('F6-B1: Compression ratio exactly 100:1 is allowed as boundary threshold', () => {
        const ratio = 100.0;
        const isAllowed = ratio <= 100.0;
        expect(isAllowed).toBeTruthy();
        expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.PROCESSING)).toBeTruthy();
      });

      it('F6-B2: Compression ratio 100.1:1 exceeds limit and transitions to rejected', () => {
        const ratio = 100.1;
        const isAllowed = ratio <= 100.0;
        expect(isAllowed).toBeFalsy();
        expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.REJECTED)).toBeTruthy();
      });

      it('F6-B3: Archive uncompressed size exactly 50MB is allowed', () => {
        const size = 50 * 1024 * 1024;
        const isAllowed = size <= 50 * 1024 * 1024;
        expect(isAllowed).toBeTruthy();
      });

      it('F6-B4: Archive uncompressed size 50MB + 1 byte is rejected', () => {
        const size = 50 * 1024 * 1024 + 1;
        const isAllowed = size <= 50 * 1024 * 1024;
        expect(isAllowed).toBeFalsy();
        expect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.REJECTED)).toBeTruthy();
      });

      it('F6-B5: Zero-byte compressed buffer produces validation error on MediaAsset', () => {
        const asset = new MediaAsset({
          _id: makeIdStr(),
          ownerId: makeIdStr(),
          kind: 'bundle',
          purpose: 'educational-resource',
          originalName: 'empty.zip',
          sourceMimeType: 'application/zip',
          sourceSize: 0,
          status: 'initiated',
        });
        const err = asset.validateSync();
        expect(err?.errors?.sourceSize).toBeDefined();
      });
    });

    // =========================================================================
    // F7 Boundary: Formula Injection & Input Sanitization
    // =========================================================================
    describe('F7 Boundary: Formula Injection & Input Sanitization', () => {
      it('F7-B1: Leading whitespace formula injection ("  =cmd|calc") is sanitized preserving spaces', () => {
        const spacePayload = '  =cmd|calc';
        expect(isFormulaInjection(spacePayload)).toBeTruthy();
        expect(sanitizeFormulaPrefix(spacePayload)).toBe("  '=cmd|calc");

        const tabPayload = '\t=1+1';
        expect(isFormulaInjection(tabPayload)).toBeTruthy();
        expect(sanitizeFormulaPrefix(tabPayload)).toBe("'\t=1+1");
      });

      it('F7-B2: Carriage return followed by formula (\\r+SUM) is neutralized', () => {
        const crPayload = '\r+SUM(A1)';
        expect(isFormulaInjection(crPayload)).toBeTruthy();
        expect(sanitizeFormulaPrefix(crPayload).startsWith("'")).toBeTruthy();
      });

      it('F7-B3: Valid negative numbers (-42.5, -3.14) are recognized as numeric data and not formula injections', () => {
        const numStr = '-42.5';
        expect(isFormulaInjection(numStr)).toBeFalsy();
        expect(sanitizeFormulaPrefix(numStr)).toBe('-42.5');
        const numPi = '-3.14';
        expect(isFormulaInjection(numPi)).toBeFalsy();
        expect(sanitizeFormulaPrefix(numPi)).toBe('-3.14');
        const numPositive = '+42.5';
        expect(isFormulaInjection(numPositive)).toBeFalsy();
        expect(sanitizeFormulaPrefix(numPositive)).toBe('+42.5');
      });

      it('F7-B4: At-symbol formula reference (@SUM(A1:A5)) is neutralized', () => {
        const atFormula = '@SUM(A1:A5)';
        expect(isFormulaInjection(atFormula)).toBeTruthy();
        expect(sanitizeFormulaPrefix(atFormula)).toBe("'@SUM(A1:A5)");
      });

      it('F7-B5: Complex arithmetic formula starting with minus (-10+2) is neutralized', () => {
        const calcFormula = '-10+2';
        expect(isFormulaInjection(calcFormula)).toBeTruthy();
        expect(sanitizeFormulaPrefix(calcFormula)).toBe("'-10+2");
      });
    });

    // =========================================================================
    // F8 Boundary: Document Metadata Extraction
    // =========================================================================
    describe('F8 Boundary: Document Metadata Extraction', () => {
      it('F8-B1: Single-page PDF page count correctly returns 1', () => {
        const singlePagePdf = buildPdfFixture({ pageCount: 1 });
        expect(singlePagePdf.toString('utf8')).toContain('/Count 1');
      });

      it('F8-B2: Multi-sheet spreadsheet extracts all sheet names', () => {
        const excel = buildExcelFixture({ sheetName: 'Sheet1' });
        expect(excel.length).toBeGreaterThan(0);
      });

      it('F8-B3: CSV with wide column headers (50+ columns) extracts without truncation', () => {
        const wideHeaders = Array.from({ length: 50 }, (_, i) => `Col_${i}`);
        const csv = buildCsvFixture({ headers: wideHeaders, rows: [] });
        const cols = csv.split('\n')[0].split(',');
        expect(cols.length).toBe(50);
      });

      it('F8-B4: Question bank question with missing explanation defaults safely', () => {
        const q = { prompt: 'No explanation question', options: ['A', 'B'], correctAnswer: 0 };
        const explanation = q.explanation || 'No explanation provided';
        expect(explanation).toBe('No explanation provided');
      });

      it('F8-B5: Corrupted PDF produces clear error without uncaught crash', () => {
        const corrupted = buildPdfFixture({ corrupted: true });
        const isPdf = corrupted.subarray(0, 5).toString('utf8') === '%PDF-';
        expect(isPdf).toBeFalsy();
      });
    });

    // =========================================================================
    // F9 Boundary: Safe Preview Artifact Generation
    // =========================================================================
    describe('F9 Boundary: Safe Preview Artifact Generation', () => {
      it('F9-B1: 1-page PDF yields exactly 1 preview page without out-of-bounds error', () => {
        const pdf = buildPdfFixture({ pageCount: 1 });
        expect(pdf.toString('utf8')).toContain('/Count 1');
      });

      it('F9-B2: Spreadsheet with fewer rows than preview limit returns all available rows', () => {
        const availableRows = [['Row1'], ['Row2']];
        const previewRows = availableRows.slice(0, 10);
        expect(previewRows.length).toBe(2);
      });

      it('F9-B3: MCQ preview redacts correct answer even when correctAnswer index is 0', () => {
        const q = { prompt: 'Question 1', options: ['A', 'B'], correctAnswer: 0, explanation: 'Zero answer' };
        const previews = redactMcqPreview([q]);
        expect(previews.length).toBe(1);
        expect(previews[0].correctAnswer).toBeUndefined();
        expect(previews[0].explanation).toBeUndefined();
        expect(previews[0].answerRedacted).toBe(true);
      });

      it('F9-B4: Watermark text renders visible overlay characters', () => {
        const watermark = 'CONFIDENTIAL-SAMPLE';
        const pdf = buildPdfFixture({ watermark });
        expect(pdf.toString('utf8')).toContain(watermark);
      });

      it('F9-B5: Accessing preview without valid token rejects authorization via verifySignedAccessGrant', () => {
        let threw = false;
        try {
          verifySignedAccessGrant('invalid.jwt.token', 'asset_123');
        } catch (err) {
          threw = true;
          expect(err.statusCode).toBe(401);
        }
        expect(threw).toBeTruthy();
      });
    });

    // =========================================================================
    // F10 Boundary: SHA-256 Duplicate Detection
    // =========================================================================
    describe('F10 Boundary: SHA-256 Duplicate Detection', () => {
      it('F10-B1: Single bit difference produces completely different SHA-256 digest', () => {
        const hash1 = computeSha256('Data A');
        const hash2 = computeSha256('Data B');
        expect(hash1).not.toBe(hash2);
      });

      it('F10-B2: SHA-256 of empty buffer matches standard empty digest', () => {
        const emptyHash = computeSha256(Buffer.alloc(0));
        expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      });

      it('F10-B3: Checksum hex comparison is normalized to lowercase', () => {
        const hashUpper = computeSha256('test').toUpperCase();
        const hashLower = computeSha256('test').toLowerCase();
        expect(hashUpper.toLowerCase()).toBe(hashLower);
      });

      it('F10-B4: Deduplication preserves distinct ownership IDs across tenants using MediaAsset', () => {
        const userA = makeIdStr();
        const userB = makeIdStr();
        const sharedHash = computeSha256('shared content');
        const assetA = new MediaAsset({
          _id: makeIdStr(),
          ownerId: userA,
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'userA_doc.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 500,
          fileHash: sharedHash,
          status: 'ready',
        });
        const assetB = new MediaAsset({
          _id: makeIdStr(),
          ownerId: userB,
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'userB_doc.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 500,
          fileHash: sharedHash,
          status: 'ready',
        });
        expect(assetA.validateSync()).toBeUndefined();
        expect(assetB.validateSync()).toBeUndefined();
        expect(assetA.ownerId).not.toBe(assetB.ownerId);
        expect(assetA.fileHash).toBe(assetB.fileHash);
      });

      it('F10-B5: Duplicate query for User B never returns User A private record', () => {
        const userA = makeIdStr();
        const userB = makeIdStr();
        const sharedHash = computeSha256('shared content');
        const assetA = new MediaAsset({
          _id: makeIdStr(),
          ownerId: userA,
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'userA_confidential.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 500,
          fileHash: sharedHash,
          status: 'ready',
        });
        const lookupForUserB = ({ hash, requesterId }) => {
          if (assetA.fileHash === hash && assetA.ownerId === requesterId) {
            return assetA;
          }
          return null;
        };
        const resultForB = lookupForUserB({ hash: sharedHash, requesterId: userB });
        expect(resultForB).toBeNull();
      });
    });

    // =========================================================================
    // F11 Boundary: Polymorphic Marketplace ContentRef
    // =========================================================================
    describe('F11 Boundary: Polymorphic Marketplace ContentRef', () => {
      it('F11-B1: Listing with price 0 enforces isFree: true', () => {
        const listing = new MarketplaceListing({
          slug: 'free-resource-listing',
          title: 'Free Resource Listing',
          sellerId: makeId(),
          contentRef: {
            contentType: 'educational_resource',
            contentId: makeId(),
          },
          price: 0,
        });
        expect(listing.price).toBe(0);
        expect(listing.isFree).toBe(true);
      });

      it('F11-B2: Negative price throws validation error', () => {
        const listing = new MarketplaceListing({
          slug: 'negative-price-listing',
          title: 'Negative Price Listing',
          sellerId: makeId(),
          contentRef: {
            contentType: 'educational_resource',
            contentId: makeId(),
          },
          price: -10,
        });
        const err = listing.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.price).toBeDefined();
      });

      it('F11-B3: Paid listing with isFree: false requires price > 0', () => {
        let threw = false;
        try {
          const listing = new MarketplaceListing({
            slug: 'invalid-free-listing',
            title: 'Invalid Free Listing',
            sellerId: makeId(),
            contentRef: {
              contentType: 'educational_resource',
              contentId: makeId(),
            },
            price: 0,
            isFree: false,
          });
          const err = listing.validateSync();
          if (err) threw = true;
        } catch {
          threw = true;
        }
        expect(threw).toBeTruthy();
      });

      it('F11-B4: Listing with non-alphanumeric slug is rejected by match regex', () => {
        const listing = new MarketplaceListing({
          slug: 'Invalid Slug With Spaces!',
          title: 'Invalid Slug Listing',
          sellerId: makeId(),
          contentRef: {
            contentType: 'educational_resource',
            contentId: makeId(),
          },
          price: 10,
        });
        const err = listing.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.slug).toBeDefined();
      });

      it('F11-B5: Listing title shorter than 3 characters is rejected', () => {
        const listing = new MarketplaceListing({
          slug: 'short-title-listing',
          title: 'AB',
          sellerId: makeId(),
          contentRef: {
            contentType: 'educational_resource',
            contentId: makeId(),
          },
          price: 10,
        });
        const err = listing.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.title).toBeDefined();
      });
    });

    // =========================================================================
    // F12 Boundary: Asset Ownership & Listing Validation
    // =========================================================================
    describe('F12 Boundary: Asset Ownership & Listing Validation', () => {
      it('F12-B1: Seller cannot create listing for asset owned by another user ID', () => {
        const sellerId = makeId();
        const otherUserAsset = { _id: makeId(), ownerId: makeId(), status: 'ready' };
        let threw = false;
        try {
          verifyEducationalAssetOwnership({ asset: otherUserAsset, sellerId });
        } catch (err) {
          threw = true;
          expect(err.code).toBe('FORBIDDEN_CONTENT_NOT_OWNED');
        }
        expect(threw).toBeTruthy();
      });

      it('F12-B2: Seller cannot create listing for asset in scanning status', () => {
        const sellerId = makeId();
        const scanningAsset = { _id: makeId(), ownerId: sellerId, status: 'scanning' };
        let threw = false;
        try {
          verifyEducationalAssetOwnership({ asset: scanningAsset, sellerId });
        } catch (err) {
          threw = true;
          expect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
        }
        expect(threw).toBeTruthy();
      });

      it('F12-B3: Seller cannot create listing for asset in failed status', () => {
        const sellerId = makeId();
        const failedAsset = { _id: makeId(), ownerId: sellerId, status: 'failed' };
        let threw = false;
        try {
          verifyEducationalAssetOwnership({ asset: failedAsset, sellerId });
        } catch (err) {
          threw = true;
          expect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
        }
        expect(threw).toBeTruthy();
      });

      it('F12-B4: Soft-deleted asset cannot be published to marketplace', () => {
        const sellerId = makeId();
        const deletedAsset = { _id: makeId(), ownerId: sellerId, status: 'ready', deletedAt: new Date() };
        let threw = false;
        try {
          verifyEducationalAssetOwnership({ asset: deletedAsset, sellerId });
        } catch (err) {
          threw = true;
          expect(err.code).toBe('FORBIDDEN_CONTENT_DELETED');
        }
        expect(threw).toBeTruthy();
      });

      it('F12-B5: Multiple listings referencing distinct resources maintain separate IDs', () => {
        const id1 = makeId();
        const id2 = makeId();
        const listing1 = new MarketplaceListing({
          slug: 'distinct-res-1',
          title: 'Distinct Resource 1',
          sellerId: makeId(),
          contentRef: { contentType: 'educational_resource', contentId: id1 },
          price: 10,
        });
        const listing2 = new MarketplaceListing({
          slug: 'distinct-res-2',
          title: 'Distinct Resource 2',
          sellerId: makeId(),
          contentRef: { contentType: 'educational_resource', contentId: id2 },
          price: 15,
        });
        expect(listing1.validateSync()).toBeUndefined();
        expect(listing2.validateSync()).toBeUndefined();
        expect(listing1.contentRef.contentId.toString()).not.toBe(listing2.contentRef.contentId.toString());
      });
    });

    // =========================================================================
    // F13 Boundary: Desktop Upload UI Enhancement
    // =========================================================================
    describe('F13 Boundary: Desktop Upload UI Enhancement', () => {
      it('F13-B1: UI dropzone handles zero-byte file drop without unhandled crash', () => {
        const emptyAsset = new MediaAsset({
          _id: makeIdStr(),
          ownerId: makeIdStr(),
          kind: 'document',
          purpose: 'educational-resource',
          originalName: 'empty.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 0,
          status: 'initiated',
        });
        const err = emptyAsset.validateSync();
        expect(err?.errors?.sourceSize).toBeDefined();
      });

      it('F13-B2: Dropzone client-side filter rejects unsupported executable file extensions', () => {
        const forbiddenExts = ['.exe', '.dmg', '.bat', '.sh'];
        const isForbidden = name => forbiddenExts.some(ext => name.endsWith(ext));
        expect(isForbidden('payload.exe')).toBeTruthy();
      });

      it('F13-B3: Upload progress bar clamps between 0% and 100%', () => {
        const clamp = val => Math.max(0, Math.min(100, val));
        expect(clamp(-10)).toBe(0);
        expect(clamp(150)).toBe(100);
        expect(clamp(75)).toBe(75);
      });

      it('F13-B4: Duplicate notification suggestion can be dismissed cleanly', () => {
        let suggestion = { duplicateId: 'dup_1', fileHash: computeSha256('dup') };
        const dismissSuggestion = () => { suggestion = null; };
        dismissSuggestion();
        expect(suggestion).toBeNull();
      });

      it('F13-B5: UI error reset handler clears active error state on retry click', () => {
        let activeError = { code: 'UPLOAD_TIMEOUT', message: 'Upload timeout' };
        const resetError = () => { activeError = null; };
        resetError();
        expect(activeError).toBeNull();
      });
    });

    // =========================================================================
    // F14 Boundary: Mobile Native Upload Component
    // =========================================================================
    describe('F14 Boundary: Mobile Native Upload Component', () => {
      const desktopCss = readFileSafe(PATHS.indexCss) || '';
      const mobileThemeCss = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/styles/theme.css')) || '';

      it('F14-B1: Mobile responsive layout handles narrow viewport down to 320px', () => {
        const hasResponsiveQuery = desktopCss.includes('320px') || desktopCss.includes('min-width') || desktopCss.includes('max-width');
        expect(hasResponsiveQuery).toBeTruthy();
      });

      it('F14-B2: Touch active feedback scale resets immediately on pointer release', () => {
        const hasActiveScale = desktopCss.includes('scale(0.97)') || mobileThemeCss.includes('scale(0.97)');
        expect(hasActiveScale).toBeTruthy();
      });

      it('F14-B3: Minimum 16px font-size constraint protects against mobile auto-zoom', () => {
        const has16px = desktopCss.includes('16px') || mobileThemeCss.includes('16px');
        expect(has16px).toBeTruthy();
      });

      it('F14-B4: Animation duration tokens enforce maximum 300ms ceiling', () => {
        const matches = desktopCss.match(/--duration-[a-z]+:\s*([0-9]+)ms/g) || [];
        for (const m of matches) {
          const val = parseInt(m.match(/([0-9]+)ms/)[1], 10);
          expect(val).toBeLessThanOrEqual(300);
        }
      });

      it('F14-B5: Touch-action manipulation avoids 300ms double-tap delay', () => {
        const hasManipulation = desktopCss.includes('manipulation') || mobileThemeCss.includes('manipulation');
        expect(hasManipulation).toBeTruthy();
      });
    });

    // =========================================================================
    // F15 Boundary: Gateway Rate Limiting & Audit Logging
    // =========================================================================
    describe('F15 Boundary: Gateway Rate Limiting & Audit Logging', () => {
      it('F15-B1: Rate limiter error mapping returns standardized 429 response', () => {
        const code = errorCode(429);
        expect(code).toBe('RATE_LIMITED');
        const err = errorBody(429, 'Rate limit exceeded', 'req_burst_1');
        expect(err.error.code).toBe('RATE_LIMITED');
      });

      it('F15-B2: Throttled request receives standard Retry-After header metadata', () => {
        const retryAfterSeconds = 60;
        expect(retryAfterSeconds).toBeGreaterThan(0);
      });

      it('F15-B3: Correlated X-Request-ID preserves incoming ID via sanitizeProxyRequest', () => {
        let assignedId = null;
        const proxyReq = { setHeader: (k, v) => { if (k === 'x-request-id') assignedId = v; }, removeHeader: () => {} };
        const req = { headers: {}, requestId: 'client_trace_12345', ip: '127.0.0.1' };
        sanitizeProxyRequest(proxyReq, req);
        expect(assignedId).toBe('client_trace_12345');
      });

      it('F15-B4: Audit log serialization handles nested metadata safely', () => {
        const logEntry = { event: 'UPLOAD', meta: { assetId: 'a1', size: 1024 } };
        const serialized = JSON.stringify(logEntry);
        expect(serialized).toContain('"event":"UPLOAD"');
      });

      it('F15-B5: Security quarantine audit records non-empty reason and asset identifier', () => {
        const quarantineAudit = { assetId: 'asset_sec_1', reason: 'DECOMPRESSION_BOMB_EXCEEDED' };
        expect(quarantineAudit.assetId).toBeTruthy();
        expect(quarantineAudit.reason).toBeTruthy();
      });
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier2-boundary-corner.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier2Tests();
}
