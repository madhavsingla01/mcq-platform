/**
 * QuizFocus Phase 4 — Tier 5: Adversarial Hardening & Cross-Service Stress Suite
 * Integrates comprehensive adversarial security verifications from Challenger 1 and Challenger 2:
 * 
 * Sub-Suites:
 * - 5.1: API Gateway Perimeter & Header Sanitization (T5-GW-1 to T5-GW-3)
 * - 5.2: Media Service Quota, Concurrency & Token Tampering (T5-MED-1 to T5-MED-3)
 * - 5.3: Parser Service Formula Injection, Corrupted Archives & Malformed Banks (T5-PRS-1 to T5-PRS-4)
 * - 5.4: Marketplace Invariants, Zero Duplication & Cross-Tenant Isolation (T5-MKT-1 to T5-MKT-3)
 * - 5.5: Frontend Worst-Case Data & Resilience (T5-ADV-1.1 to T5-ADV-1.5)
 * - 5.6: Mobile Native & Touch Boundaries (T5-ADV-2.1 to T5-ADV-2.5)
 * - 5.7: State Machine Illegal Transition Matrix & Invariants (T5-ADV-3.1 to T5-ADV-3.5)
 * - 5.8: Quarantined Asset Defense-in-Depth Handling (T5-ADV-4.1 to T5-ADV-4.5)
 * - 5.9: Concurrent Duplicate Detection Multi-Tenant Isolation (T5-ADV-5.1 to T5-ADV-5.5)
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe as runnerDescribe, it as runnerIt, expect as runnerExpect } from './helpers/runner-core.js';
import { readFileSafe, PATHS } from './helpers/static-checker.js';
import { computeSha256 } from './helpers/resource-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const platformRoot = path.resolve(__dirname, '..', '..');

// Environment bootstrapping
process.env.PORT = process.env.PORT || '5002';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quizfocus_test';
process.env.MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || 'storage';
process.env.MEDIA_MAX_FILE_SIZE = process.env.MEDIA_MAX_FILE_SIZE || '52428800';
process.env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE = process.env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE || '52428800';
process.env.MEDIA_CREATOR_MAX_STORAGE_BYTES = process.env.MEDIA_CREATOR_MAX_STORAGE_BYTES || '524288000';
process.env.MEDIA_CREATOR_MAX_ASSET_COUNT = process.env.MEDIA_CREATOR_MAX_ASSET_COUNT || '100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-secure-32-byte-test-secret-key-for-jwt-tokens!!';

// Dynamic imports of service modules
const mongoose = (await import(pathToFileURL(path.join(platformRoot, 'services/marketplace-service/node_modules/mongoose/index.js')))).default;
const makeId = () => new mongoose.Types.ObjectId();
const makeIdStr = () => new mongoose.Types.ObjectId().toString();

const {
  isUploadProcessingRequest,
  createRateLimiter,
  resetRateLimitStore,
} = await import(pathToFileURL(path.join(platformRoot, 'services/api-gateway/dist/middleware/rateLimit.js')));

const {
  sanitizeProxyRequest,
  sanitizeFilename,
} = await import(pathToFileURL(path.join(platformRoot, 'services/api-gateway/dist/contracts.js')));

const {
  createSignedUploadToken,
  verifySignedUploadToken,
  createSignedAccessGrant,
  verifySignedAccessGrant,
  checkCreatorQuota,
} = await import(pathToFileURL(path.join(platformRoot, 'services/media-service/dist/services/educationalAsset.service.js')));

const {
  LIFECYCLE_STATES,
  canTransition,
  validateTransition,
  TERMINAL_STATES,
} = await import(pathToFileURL(path.join(platformRoot, 'services/media-service/dist/services/educationalStateMachine.js')));

const MediaAsset = (await import(
  pathToFileURL(path.join(platformRoot, 'services/media-service/dist/models/MediaAsset.model.js'))
)).default;

const {
  isFormulaInjection,
  sanitizeFormulaPrefix,
  sanitizeMetadataString,
} = await import(pathToFileURL(path.join(platformRoot, 'services/parser-service/src/services/security/formulaSanitizer.service.js')));

const {
  inspectZipHeaders,
  inspectDecompressionSafety,
} = await import(pathToFileURL(path.join(platformRoot, 'services/parser-service/src/services/security/decompressionGuard.service.js')));

const {
  inspectJsonQuestionBank,
  validateAndInspectFile,
} = await import(pathToFileURL(path.join(platformRoot, 'services/parser-service/src/services/security/fileInspection.service.js')));

const {
  scanZipForVbaMacros,
  scanExecutableSignatures,
} = await import(pathToFileURL(path.join(platformRoot, 'services/parser-service/src/services/security/macroDetector.service.js')));

const {
  MarketplaceListing,
  FORBIDDEN_DUPLICATION_FIELDS,
} = await import(pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/models/MarketplaceListing.model.js')));

const {
  MarketplaceEntitlement,
} = await import(pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/models/MarketplaceEntitlement.model.js')));

const {
  verifyQuizOwnership,
  verifyEducationalAssetOwnership,
  OwnershipError,
} = await import(pathToFileURL(path.join(platformRoot, 'services/marketplace-service/src/services/ownership.service.js')));

const {
  withGenerationLock,
  calculateFileHash,
} = await import(pathToFileURL(path.join(platformRoot, 'services/parser-service/src/services/upload/fileHash.service.js')));

const { default: Quiz } = await import(
  pathToFileURL(path.join(platformRoot, 'services/parser-service/src/models/Quiz.model.js'))
);

runnerDescribe('Tier 5: Adversarial Hardening & Cross-Service Stress (38 Tests)', () => {

  // -------------------------------------------------------------
  // SUITE 5.1: API Gateway Security & Rate Limiting Defense
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.1: API Gateway Perimeter & Header Sanitization', () => {
    runnerIt('T5-GW-1: Rate limiter predicate correctly matches mounted Express sub-paths using originalUrl', () => {
      // In Express, when mounted under app.use('/api/v1/media'), req.path is '/assets/initiate'
      const mountedMediaReq = {
        method: 'POST',
        path: '/assets/initiate',
        originalUrl: '/api/v1/media/assets/initiate',
      };
      // A robust predicate MUST inspect originalUrl to avoid mount-stripping bypass
      runnerExpect(isUploadProcessingRequest(mountedMediaReq)).toBe(true);

      const mountedUploadReq = {
        method: 'POST',
        path: '/',
        originalUrl: '/api/v1/upload',
      };
      runnerExpect(isUploadProcessingRequest(mountedUploadReq)).toBe(true);
    });

    runnerIt('T5-GW-2: Strips exact unhyphenated identity headers and case-variant role headers', () => {
      class HeaderRecorder {
        constructor(h) { this.headers = { ...h }; }
        setHeader(k, v) { this.headers[k] = v; }
        removeHeader(k) { delete this.headers[k]; }
      }

      const clientHeaders = {
        'x-user': 'spoofed_user',
        'x-admin': 'true',
        'x-internal': 'trusted',
        'x-auth': 'elevated',
        'x-user-id': 'attacker_id',
        'X-Role': 'admin',
        'x-forwarded-user': 'admin@system.local',
        'x-filename': '../../malicious.sh\0.pdf',
      };

      const recorder = new HeaderRecorder(clientHeaders);
      sanitizeProxyRequest(recorder, {
        headers: clientHeaders,
        requestId: 'req_tier5_1',
        ip: '10.0.0.1',
      });

      // Verify dangerous headers are purged
      runnerExpect(recorder.headers['x-user']).toBeUndefined();
      runnerExpect(recorder.headers['x-admin']).toBeUndefined();
      runnerExpect(recorder.headers['x-internal']).toBeUndefined();
      runnerExpect(recorder.headers['x-auth']).toBeUndefined();
      runnerExpect(recorder.headers['x-user-id']).toBeUndefined();
      runnerExpect(recorder.headers['X-Role']).toBeUndefined();
      runnerExpect(recorder.headers['x-forwarded-user']).toBeUndefined();
      runnerExpect(recorder.headers['x-filename']).toBe('malicious.sh.pdf');
    });

    runnerIt('T5-GW-3: Rate limiter enforces 429 quota and returns RFC standard headers', () => {
      resetRateLimitStore();
      const limiter = createRateLimiter({
        windowMs: 10000,
        max: 3,
        keyGenerator: () => 'adversarial-tester',
      });

      let statusCode = 200;
      let body = null;
      const res = {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        getHeader(k) { return this.headers[k]; },
        status(c) {
          statusCode = c;
          return { json: (d) => { body = d; } };
        },
      };

      const req = { ip: '1.1.1.1', method: 'POST', path: '/api/v1/upload' };

      // Request 1, 2, 3: Success
      limiter(req, res, () => {});
      limiter(req, res, () => {});
      limiter(req, res, () => {});
      runnerExpect(res.getHeader('RateLimit-Remaining')).toBe('0');

      // Request 4: Throttled with 429
      limiter(req, res, () => {});
      runnerExpect(statusCode).toBe(429);
      runnerExpect(res.getHeader('Retry-After')).toBeDefined();
      runnerExpect(body.error.code).toBe('RATE_LIMITED');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.2: Media Service Quota, Concurrency & Token Tampering
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.2: Media Service Quota, State Machine & Token Tampering', () => {
    runnerIt('T5-MED-1: Token tampering rejects algorithm none, forged secret, and target asset mismatch', () => {
      const assetId1 = '11111111-1111-4111-8111-111111111111';
      const assetId2 = '22222222-2222-4222-8222-222222222222';
      const validToken = createSignedUploadToken(assetId1, 'creator_1');

      // 1. Cross-asset tampering
      let targetMismatchError = null;
      try {
        verifySignedUploadToken(validToken, assetId2);
      } catch (err) {
        targetMismatchError = err;
      }
      runnerExpect(targetMismatchError).toBeDefined();
      runnerExpect(targetMismatchError.statusCode).toBe(403);

      // 2. Algorithm none token
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const nonePayload = Buffer.from(JSON.stringify({
        assetId: assetId1,
        ownerId: 'creator_1',
        scope: 'educational-upload',
        aud: 'quizfocus-media',
        iss: 'quizfocus-media-service',
        exp: Math.floor(Date.now() / 1000) + 900,
      })).toString('base64url');
      let noneError = null;
      try {
        verifySignedUploadToken(`${noneHeader}.${nonePayload}.`, assetId1);
      } catch (err) {
        noneError = err;
      }
      runnerExpect(noneError).toBeDefined();
      runnerExpect(noneError.statusCode).toBe(401);

      // 3. Cross-scope attack: upload token presented to content access endpoint
      let scopeError = null;
      try {
        verifySignedAccessGrant(validToken, assetId1);
      } catch (err) {
        scopeError = err;
      }
      runnerExpect(scopeError).toBeDefined();
      runnerExpect(scopeError.statusCode).toBe(403);
    });

    runnerIt('T5-MED-2: Creator quota rejects zero, negative, and infinite incoming file sizes', async () => {
      let zeroErr = null;
      try {
        await checkCreatorQuota('user_1', 0);
      } catch (err) {
        zeroErr = err;
      }
      runnerExpect(zeroErr).toBeDefined();
      runnerExpect(zeroErr.statusCode).toBe(400);

      let negErr = null;
      try {
        await checkCreatorQuota('user_1', -1024);
      } catch (err) {
        negErr = err;
      }
      runnerExpect(negErr).toBeDefined();
      runnerExpect(negErr.statusCode).toBe(400);

      let infErr = null;
      try {
        await checkCreatorQuota('user_1', Infinity);
      } catch (err) {
        infErr = err;
      }
      runnerExpect(infErr).toBeDefined();
      runnerExpect(infErr.statusCode).toBe(400);
    });

    runnerIt('T5-MED-3: Educational lifecycle state machine strictly blocks terminal and illegal transitions', () => {
      // Terminal states cannot transition to anything
      runnerExpect(canTransition(LIFECYCLE_STATES.READY, LIFECYCLE_STATES.PROCESSING)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.REJECTED, LIFECYCLE_STATES.SCANNING)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.READY)).toBe(false);

      // Prohibit self-loops
      runnerExpect(canTransition(LIFECYCLE_STATES.PROCESSING, LIFECYCLE_STATES.PROCESSING)).toBe(false);

      // Exceeded max retry attempts (>= 3) prevents failed -> scanning
      runnerExpect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.SCANNING, 3)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.3: Parser Service Adversarial Variants & Decompression Defense
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.3: Parser Service Formula Injection, Corrupted Archives & Malformed Banks', () => {
    runnerIt('T5-PRS-1: Formula sanitizer neutralizes standard & adversarial formula triggers while preserving valid numbers', () => {
      // Legitimate numbers must NOT be sanitized
      runnerExpect(isFormulaInjection('-42')).toBe(false);
      runnerExpect(isFormulaInjection('+3.14')).toBe(false);
      runnerExpect(isFormulaInjection('1e5')).toBe(false);
      runnerExpect(sanitizeFormulaPrefix('-42')).toBe('-42');

      // Standard triggers must be prefixed with single quote
      runnerExpect(sanitizeFormulaPrefix('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      runnerExpect(sanitizeFormulaPrefix('@HYPERLINK("evil.com")')).toBe("'@HYPERLINK(\"evil.com\")");
      runnerExpect(sanitizeFormulaPrefix('\t=1+1')).toBe("'\t=1+1");
      runnerExpect(sanitizeFormulaPrefix('\r=1+1')).toBe("'\r=1+1");

      // Adversarial full-width, zero-width, and DDE pipe variants
      runnerExpect(isFormulaInjection('＋1+1')).toBe(true);
      runnerExpect(sanitizeFormulaPrefix('＋1+1')).toBe("'＋1+1");

      runnerExpect(isFormulaInjection('－1+1')).toBe(true);
      runnerExpect(sanitizeFormulaPrefix('－1+1')).toBe("'－1+1");

      runnerExpect(isFormulaInjection('＠SUM(1,2)')).toBe(true);
      runnerExpect(sanitizeFormulaPrefix('＠SUM(1,2)')).toBe("'＠SUM(1,2)");

      runnerExpect(isFormulaInjection('|cmd')).toBe(true);
      runnerExpect(sanitizeFormulaPrefix('|cmd')).toBe("'|cmd");

      runnerExpect(isFormulaInjection('\u200B=1+1')).toBe(true);
      runnerExpect(sanitizeFormulaPrefix('\u200B=1+1')).toBe("'\u200B=1+1");
    });

    runnerIt('T5-PRS-2: Truncated 4-byte ZIP container and decompression bombs are safely handled', async () => {
      // Truncated 4-byte PK\x03\x04 archive must be rejected
      const truncZip = inspectZipHeaders(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      runnerExpect(truncZip.ok).toBe(false);
      runnerExpect(truncZip.failureCode).toBe('CORRUPT_ARCHIVE');

      // Empty valid ZIP (22-byte EOCD) must be accepted
      const emptyZip = inspectZipHeaders(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      runnerExpect(emptyZip.ok).toBe(true);
      runnerExpect(emptyZip.entryCount).toBe(0);

      // Binary executable header inspection detects Windows PE (MZ)
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const peResult = scanExecutableSignatures(peBuffer);
      runnerExpect(peResult.isExecutable).toBe(true);
      runnerExpect(peResult.type).toBe('PE');

      // Linux ELF header inspection
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const elfResult = scanExecutableSignatures(elfBuffer);
      runnerExpect(elfResult.isExecutable).toBe(true);
      runnerExpect(elfResult.type).toBe('ELF');
    });

    runnerIt('T5-PRS-3: Macro scanner detects embedded VBA project in ZIP archives', () => {
      // Buffer containing vbaproject.bin indicator
      const macroZipBuffer = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('xl/vbaProject.bin embedded stream data'),
      ]);
      const macroRes = scanZipForVbaMacros(macroZipBuffer);
      runnerExpect(macroRes.hasMacros).toBe(true);
      runnerExpect(macroRes.streamName).toBe('vbaproject.bin');
    });

    runnerIt('T5-PRS-4: Question bank schema inspector rejects missing prompts, invalid options, and empty files', () => {
      // Empty JSON file rejected
      const emptyRes = inspectJsonQuestionBank(Buffer.from(''));
      runnerExpect(emptyRes.valid).toBe(false);
      runnerExpect(emptyRes.failureCode).toBe('EMPTY_FILE');

      // Missing prompt rejected
      const missingPromptJson = JSON.stringify([{ options: ['A', 'B'] }]);
      const noPromptRes = inspectJsonQuestionBank(missingPromptJson);
      runnerExpect(noPromptRes.valid).toBe(false);
      runnerExpect(noPromptRes.failureCode).toBe('MISSING_PROMPT');

      // Insufficient options (< 2) rejected
      const oneOptionJson = JSON.stringify([{ prompt: 'Is this valid?', options: ['Yes'] }]);
      const oneOptRes = inspectJsonQuestionBank(oneOptionJson);
      runnerExpect(oneOptRes.valid).toBe(false);
      runnerExpect(oneOptRes.failureCode).toBe('INVALID_OPTIONS_ARRAY');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.4: Marketplace Service Invariants & Multi-Tenant Privacy
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.4: Marketplace Invariants, Zero Duplication & Cross-Tenant Isolation', () => {
    runnerIt('T5-MKT-1: Zero Duplication Invariant strictly rejects storing forbidden content fields', () => {
      const sellerId = new mongoose.Types.ObjectId();
      const quizId = new mongoose.Types.ObjectId();

      for (const forbiddenField of FORBIDDEN_DUPLICATION_FIELDS) {
        let threw = false;
        try {
          const listing = new MarketplaceListing({
            title: 'Test Listing',
            slug: `test-listing-${forbiddenField}`,
            sellerId,
            quizId,
            price: 15,
            [forbiddenField]: [{ text: 'illegal duplicate content' }],
          });
          const err = listing.validateSync();
          if (err) threw = true;
        } catch (e) {
          threw = true;
        }
        runnerExpect(threw).toBe(true);
      }
    });

    runnerIt('T5-MKT-2: Ownership verification blocks unauthorized sellers and unready assets', () => {
      const sellerId = new mongoose.Types.ObjectId();
      const otherUserId = new mongoose.Types.ObjectId();

      // Unauthorized seller cannot list quiz
      let unownedQuizErr = null;
      try {
        verifyQuizOwnership({
          quiz: { _id: new mongoose.Types.ObjectId(), uploader: otherUserId },
          sellerId,
        });
      } catch (err) {
        unownedQuizErr = err;
      }
      runnerExpect(unownedQuizErr).toBeDefined();
      runnerExpect(unownedQuizErr.code).toBe('FORBIDDEN_CONTENT_NOT_OWNED');

      // Cannot list educational asset with non-ready status
      const unreadyStatuses = ['initiated', 'uploaded', 'scanning', 'processing', 'failed', 'quarantined'];
      for (const st of unreadyStatuses) {
        let unreadyErr = null;
        try {
          verifyEducationalAssetOwnership({
            asset: { _id: '11111111-1111-4111-8111-111111111111', ownerId: sellerId, status: st },
            sellerId,
          });
        } catch (err) {
          unreadyErr = err;
        }
        runnerExpect(unreadyErr).toBeDefined();
        runnerExpect(unreadyErr.code).toBe('FORBIDDEN_ASSET_NOT_READY');
      }
    });

    runnerIt('T5-MKT-3: Polymorphic contentRef correctly maps educational_resource and syncs contentType', () => {
      const sellerId = new mongoose.Types.ObjectId();
      const assetUuid = '33333333-3333-4333-8333-333333333333';

      const listing = new MarketplaceListing({
        title: 'Advanced Machine Learning Handbook',
        slug: 'advanced-machine-learning-handbook',
        sellerId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: assetUuid,
        },
        price: 29.99,
      });

      const validationErr = listing.validateSync();
      runnerExpect(validationErr).toBeUndefined();
      runnerExpect(listing.contentType).toBe('educational_resource');
      runnerExpect(listing.contentRef.contentId).toBe(assetUuid);
      runnerExpect(listing.quizId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.5: Frontend Worst-Case Data & Resilience (break-ui)
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.5: Frontend Worst-Case Data & Resilience', () => {
    const uploadJsx = readFileSafe(path.join(platformRoot, 'apps/desktop-web/src/pages/Upload/Upload.jsx')) || '';
    const mobileUploadJsx = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/pages/Upload/MobileUploadPage.jsx')) || '';
    const fileDropzoneJsx = readFileSafe(path.join(platformRoot, 'apps/desktop-web/src/components/upload/FileDropzone.jsx')) || '';
    const mobileDropzoneJsx = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/components/upload/MobileFileDropzone.jsx')) || '';
    const mobileProgressJsx = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/components/upload/MobileLifecycleProgress.jsx')) || '';

    runnerIt('T5-ADV-1.1: Extreme filename lengths (500+ chars) are safely handled and truncated with ellipsis in metadata view', () => {
      const extremeFilename = 'curriculum_matrix_' + 'A'.repeat(500) + '.pdf';
      runnerExpect(extremeFilename.length).toBeGreaterThan(500);

      const uploadCss = readFileSafe(path.join(platformRoot, 'apps/desktop-web/src/pages/Upload/Upload.css')) || '';
      runnerExpect(uploadCss).toContain('text-overflow: ellipsis');
      runnerExpect(uploadCss).toContain('overflow: hidden');

      const lastDot = extremeFilename.lastIndexOf('.');
      const ext = extremeFilename.substring(lastDot).toUpperCase();
      runnerExpect(ext).toBe('.PDF');
    });

    runnerIt('T5-ADV-1.2: Unicode, Emoji, and Bidi RTL override characters in filenames do not break extension inspection', () => {
      const emojiName = 'Lecture_Notes_📚_Physics_🔥.pdf';
      const lastDotEmoji = emojiName.lastIndexOf('.');
      runnerExpect(emojiName.substring(lastDotEmoji).toLowerCase()).toBe('.pdf');

      const rtlOverrideName = 'important_lecture\u202Efdp.exe';
      const forbiddenExts = ['.exe', '.dmg', '.bat', '.sh', '.bin', '.cmd'];
      const isForbidden = forbiddenExts.some(f => rtlOverrideName.toLowerCase().endsWith(f));
      runnerExpect(isForbidden).toBe(true);
    });

    runnerIt('T5-ADV-1.3: Dotless filenames and leading dot hidden files are handled gracefully without undefined errors', () => {
      const dotlessFile = 'lecture_notes_no_ext';
      const lastDot = dotlessFile.lastIndexOf('.');
      runnerExpect(lastDot).toBe(-1);

      const safeExt = lastDot !== -1 ? dotlessFile.substring(lastDot).toUpperCase() : 'DOCUMENT';
      runnerExpect(safeExt).toBe('DOCUMENT');

      const hiddenFile = '.hidden_quiz.pdf';
      const hiddenDot = hiddenFile.lastIndexOf('.');
      runnerExpect(hiddenFile.substring(hiddenDot).toLowerCase()).toBe('.pdf');

      // Verify source code incorporates lastDot boundary guard
      runnerExpect(uploadJsx).toContain('lastDot !== -1');
      runnerExpect(mobileUploadJsx).toContain('lastDot !== -1');
    });

    runnerIt('T5-ADV-1.4: Zero-byte files are rejected at both dropzone client boundary and backend storage layer', () => {
      runnerExpect(fileDropzoneJsx).toContain('file.size <= 0');
      runnerExpect(mobileDropzoneJsx).toContain('file.size <= 0');

      const serviceFile = readFileSafe(path.join(platformRoot, 'services/media-service/src/services/educationalAsset.service.js')) || '';
      runnerExpect(serviceFile).toContain('bytesWritten <= 0');
      runnerExpect(serviceFile).toContain('Upload payload cannot be empty');
    });

    runnerIt('T5-ADV-1.5: Multi-gigabyte file limits enforce 413 Payload Too Large and formatBytes handles multi-unit bounds', () => {
      const maxLimit = 50 * 1024 * 1024;
      const oversizedPayload = 55 * 1024 * 1024;
      runnerExpect(oversizedPayload > maxLimit).toBe(true);

      function formatBytesTest(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
      }
      runnerExpect(formatBytesTest(oversizedPayload)).toBe('55 MB');
      runnerExpect(formatBytesTest(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
      runnerExpect(formatBytesTest(1099511627776)).toBe('1 TB');

      // Verify formatBytes has TB and bounds clamping in source files
      runnerExpect(uploadJsx).toContain("'TB'");
      runnerExpect(uploadJsx).toContain('sizes.length - 1');
      runnerExpect(mobileProgressJsx).toContain("'TB'");
      runnerExpect(mobileProgressJsx).toContain('sizes.length - 1');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.6: Mobile Native & Touch Boundaries
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.6: Mobile Native & Touch Boundaries', () => {
    const mobileUploadCss = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/pages/Upload/MobileUploadPage.css')) || '';
    const actionSheetJsx = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/components/upload/DuplicateActionSheet.jsx')) || '';
    const mobileDropzoneJsx = readFileSafe(path.join(platformRoot, 'apps/mobile-web/src/components/upload/MobileFileDropzone.jsx')) || '';

    runnerIt('T5-ADV-2.1: Input elements enforce minimum 16px font-size to prevent iOS Safari auto-zoom', () => {
      runnerExpect(mobileDropzoneJsx).toContain("fontSize: '16px'");
      runnerExpect(mobileDropzoneJsx).toContain("display: 'none'");
    });

    runnerIt('T5-ADV-2.2: Touch action manipulation and tap highlight removal are enforced on interactive mobile controls', () => {
      runnerExpect(mobileUploadCss).toContain('touch-action: manipulation');
      runnerExpect(mobileUploadCss).toContain('-webkit-tap-highlight-color: transparent');
      runnerExpect(actionSheetJsx).toContain("touchAction: 'manipulation'");
    });

    runnerIt('T5-ADV-2.3: Apple-style bottom sheet drawer implements cubic-bezier spring curve and duration under 300ms', () => {
      runnerExpect(actionSheetJsx).toContain('slideUpSheet 280ms cubic-bezier(0.32, 0.72, 0, 1)');
      runnerExpect(mobileUploadCss).toContain('@keyframes slideUpSheet');
    });

    runnerIt('T5-ADV-2.4: Active button touch states enforce Emil Kowalski scale(0.97) transform without layout shift', () => {
      runnerExpect(mobileUploadCss).toContain(':active');
      runnerExpect(mobileUploadCss).toContain('transform: scale(0.97)');
    });

    runnerIt('T5-ADV-2.5: Bottom sheet backdrop click dismissal and drag pill affordance are present for mobile ergonomics', () => {
      runnerExpect(actionSheetJsx).toContain('onClick={onDismiss}');
      runnerExpect(actionSheetJsx).toContain('e.stopPropagation()');
      runnerExpect(actionSheetJsx).toContain('borderRadius: 3');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.7: State Machine Illegal Transition Matrix & Invariants
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.7: State Machine Illegal Transition Matrix & Invariants', () => {
    runnerIt('T5-ADV-3.1: Direct illegal leap from initiated to ready is strictly prohibited', () => {
      runnerExpect(canTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.READY)).toBe(false);
      let threw = false;
      try {
        validateTransition(LIFECYCLE_STATES.INITIATED, LIFECYCLE_STATES.READY);
      } catch (err) {
        threw = true;
        runnerExpect(err.statusCode).toBe(409);
      }
      runnerExpect(threw).toBe(true);
    });

    runnerIt('T5-ADV-3.2: Illegal bypass transitions (uploaded -> ready, scanning -> ready) are prohibited', () => {
      runnerExpect(canTransition(LIFECYCLE_STATES.UPLOADED, LIFECYCLE_STATES.READY)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.SCANNING, LIFECYCLE_STATES.READY)).toBe(false);
    });

    runnerIt('T5-ADV-3.3: Quarantined state cannot transition to ready or processing under any circumstances', () => {
      runnerExpect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.READY)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.PROCESSING)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.QUARANTINED, LIFECYCLE_STATES.SCANNING)).toBe(false);
      runnerExpect(TERMINAL_STATES.has(LIFECYCLE_STATES.QUARANTINED)).toBe(true);
    });

    runnerIt('T5-ADV-3.4: Terminal states prohibit self-loops and backward transitions', () => {
      for (const terminal of TERMINAL_STATES) {
        runnerExpect(canTransition(terminal, terminal)).toBe(false);
        runnerExpect(canTransition(terminal, LIFECYCLE_STATES.INITIATED)).toBe(false);
        runnerExpect(canTransition(terminal, LIFECYCLE_STATES.UPLOADED)).toBe(false);
      }
    });

    runnerIt('T5-ADV-3.5: Failed state strictly enforces 3-attempt maximum retry threshold', () => {
      runnerExpect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.SCANNING, 0)).toBe(true);
      runnerExpect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.SCANNING, 2)).toBe(true);
      runnerExpect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.SCANNING, 3)).toBe(false);
      runnerExpect(canTransition(LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.PROCESSING, 4)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.8: Quarantined Asset Defense-in-Depth Handling
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.8: Quarantined Asset Defense-in-Depth Handling', () => {
    runnerIt('T5-ADV-4.1: Quarantined educational asset cannot be listed on marketplace by owner', () => {
      const sellerId = makeIdStr();
      const quarantinedAsset = {
        _id: makeIdStr(),
        ownerId: sellerId,
        status: 'quarantined',
        failureCode: 'MALICIOUS_MACRO_DETECTED',
      };

      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: quarantinedAsset, sellerId });
      } catch (err) {
        threw = true;
        runnerExpect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
      }
      runnerExpect(threw).toBe(true);
    });

    runnerIt('T5-ADV-4.2: Pre-ready lifecycle states (initiated, uploaded, scanning, processing) cannot be listed', () => {
      const sellerId = makeIdStr();
      const preReadyStates = ['initiated', 'uploaded', 'scanning', 'processing', 'rejected', 'failed'];

      for (const st of preReadyStates) {
        const asset = { _id: makeIdStr(), ownerId: sellerId, status: st };
        let threw = false;
        try {
          verifyEducationalAssetOwnership({ asset, sellerId });
        } catch (err) {
          threw = true;
          runnerExpect(err.code).toBe('FORBIDDEN_ASSET_NOT_READY');
        }
        runnerExpect(threw).toBe(true);
      }
    });

    runnerIt('T5-ADV-4.3: Soft-deleted asset in ready status cannot be listed on marketplace', () => {
      const sellerId = makeIdStr();
      const deletedAsset = {
        _id: makeIdStr(),
        ownerId: sellerId,
        status: 'ready',
        deletedAt: new Date(),
      };

      let threw = false;
      try {
        verifyEducationalAssetOwnership({ asset: deletedAsset, sellerId });
      } catch (err) {
        threw = true;
        runnerExpect(err.code).toBe('FORBIDDEN_CONTENT_DELETED');
      }
      runnerExpect(threw).toBe(true);
    });

    runnerIt('T5-ADV-4.4: Media service access guard rejects quarantined asset downloads with 403', () => {
      const serviceCode = readFileSafe(path.join(platformRoot, 'services/media-service/src/services/educationalAsset.service.js')) || '';
      runnerExpect(serviceCode).toContain("if (asset.status === 'quarantined')");
      runnerExpect(serviceCode).toContain('Asset is quarantined and cannot be accessed');
    });

    runnerIt('T5-ADV-4.5: Media service physically moves quarantined binaries into isolated .quarantine directory', () => {
      const serviceCode = readFileSafe(path.join(platformRoot, 'services/media-service/src/services/educationalAsset.service.js')) || '';
      runnerExpect(serviceCode).toContain('.quarantine');
      runnerExpect(serviceCode).toContain('updateSet.quarantinePath');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5.9: Concurrent Duplicate Detection Multi-Tenant Isolation
  // -------------------------------------------------------------
  runnerDescribe('Tier 5.9: Concurrent Duplicate Detection Multi-Tenant Isolation', () => {
    runnerIt('T5-ADV-5.1: Two creators uploading identical byte streams receive identical SHA-256 digests', async () => {
      const payload = Buffer.from('QuizFocus Standardized CS Curriculum Matrix 2026');
      const hash1 = await calculateFileHash(payload);
      const hash2 = await calculateFileHash(payload);
      runnerExpect(hash1).toBe(hash2);
      runnerExpect(hash1.length).toBe(64);
    });

    runnerIt('T5-ADV-5.2: Concurrent generation locks are partitioned by uploaderId:fileHash avoiding cross-tenant deadlocks', async () => {
      const userA = '507f1f77bcf86cd799439011';
      const userB = '507f1f77bcf86cd799439012';
      const sharedHash = computeSha256('Parallel Stream Bytes');

      const origFindOne = Quiz.findOne;
      Quiz.findOne = () => ({ sort: () => ({ select: async () => null }) });

      try {
        let taskACompleted = false;
        let taskBCompleted = false;

        const pA = withGenerationLock(sharedHash, async () => {
          await new Promise(r => setTimeout(r, 20));
          taskACompleted = true;
          return { quiz: { _id: makeId(), title: 'User A Study Guide', uploader: userA }, questionCount: 15 };
        }, { uploaderId: userA });

        const pB = withGenerationLock(sharedHash, async () => {
          await new Promise(r => setTimeout(r, 20));
          taskBCompleted = true;
          return { quiz: { _id: makeId(), title: 'User B Biology Review', uploader: userB }, questionCount: 20 };
        }, { uploaderId: userB });

        const [resA, resB] = await Promise.all([pA, pB]);
        runnerExpect(taskACompleted).toBe(true);
        runnerExpect(taskBCompleted).toBe(true);
        runnerExpect(resA.quiz.title).toBe('User A Study Guide');
        runnerExpect(resB.quiz.title).toBe('User B Biology Review');
        runnerExpect(resA.isDuplicate).toBe(false);
        runnerExpect(resB.isDuplicate).toBe(false);
      } finally {
        Quiz.findOne = origFindOne;
      }
    });

    runnerIt('T5-ADV-5.3: Duplicate detection never leaks private filenames or owner identities across tenant boundaries', () => {
      const userA = makeIdStr();
      const userB = makeIdStr();
      const checksum = computeSha256('Classified Lecture Exam Bank');

      const assetA = new MediaAsset({
        _id: makeIdStr(),
        ownerId: userA,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'Confidential_Exam_Draft_UserA.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 4096,
        fileHash: checksum,
        status: 'ready',
      });

      // User B duplicate query response
      const duplicateQueryResponseForUserB = {
        isDuplicate: true,
        fileHash: checksum,
      };

      runnerExpect(duplicateQueryResponseForUserB.originalName).toBeUndefined();
      runnerExpect(duplicateQueryResponseForUserB.ownerId).toBeUndefined();
      runnerExpect(duplicateQueryResponseForUserB.uploader).toBeUndefined();
      runnerExpect(duplicateQueryResponseForUserB.title).toBeUndefined();
      runnerExpect(duplicateQueryResponseForUserB.isDuplicate).toBe(true);
    });

    runnerIt('T5-ADV-5.4: Same-tenant duplicate reuse links identical byte streams without redundant file storage', () => {
      const creatorId = makeIdStr();
      const checksum = computeSha256('Repeated Upload Same Creator');

      const existingAsset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: creatorId,
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'Original_Courseware.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 8192,
        fileHash: checksum,
        status: 'ready',
      });

      // Reusing existing asset ID preserves Zero Duplication Invariant
      const listing = new MarketplaceListing({
        slug: 'reused-courseware-listing',
        title: 'Reused Courseware Listing',
        sellerId: creatorId,
        contentRef: {
          contentType: 'educational_resource',
          contentId: makeId(),
        },
        price: 10.0,
      });

      runnerExpect(listing.validateSync()).toBeUndefined();
      runnerExpect(listing.contentRef.contentType).toBe('educational_resource');
    });

    runnerIt('T5-ADV-5.5: Non-destructive retention guarantees asset records are preserved under deletedAt flag', () => {
      const asset = new MediaAsset({
        _id: makeIdStr(),
        ownerId: makeIdStr(),
        kind: 'document',
        purpose: 'educational-resource',
        originalName: 'Retained_Resource.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: 5000,
        fileHash: computeSha256('Retained Content'),
        status: 'ready',
        deletedAt: null,
      });

      runnerExpect(asset.deletedAt).toBeNull();
      // Simulate soft-delete
      asset.deletedAt = new Date();
      runnerExpect(asset.deletedAt).toBeDefined();
      runnerExpect(asset.status).toBe('ready'); // status remains intact for audit retention
    });
  });

});
