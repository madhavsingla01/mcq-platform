import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'agacTU3wgK3s2sWFASUE-zofnDRx36g2Z7NNRHUQGAl5BrzcBfZB2ORC6BCd1kj6';
process.env.MEDIA_STORAGE_PATH ||= './media-storage-test';
process.env.NODE_ENV = 'test';
process.env.PORT = '5099';
process.env.CLIENT_URL = 'http://localhost:5173';

const env = (await import('../src/config/env.js')).default;
const MediaAsset = (await import('../src/models/MediaAsset.model.js')).default;
const {
  canTransition,
  validateTransition,
  LIFECYCLE_STATES,
} = await import('../src/services/educationalStateMachine.js');
const {
  checkCreatorQuota,
  createSignedUploadToken,
  verifySignedUploadToken,
  createSignedAccessGrant,
  verifySignedAccessGrant,
  initiateEducationalAsset,
  saveEducationalAssetUpload,
  updateEducationalAssetStatus,
  getEducationalAssetAccess,
  streamEducationalAssetContent,
} = await import('../src/services/educationalAsset.service.js');
const app = (await import('../src/server.js')).default;

describe('Educational Resource Asset Storage & Lifecycle State Machine', () => {
  let server;
  let baseUrl;
  const testStorageDir = path.resolve(env.MEDIA_STORAGE_PATH);

  before(async () => {
    // Ensure test storage root exists
    await fsp.mkdir(testStorageDir, { recursive: true });

    // Connect mongoose to test database
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcq_media_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // Start ephemeral server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Clean up test collection
    if (mongoose.connection.readyState !== 0) {
      await MediaAsset.deleteMany({ ownerId: { $regex: /^test-/ } });
      await mongoose.disconnect();
    }
    // Clean up test storage directory
    await fsp.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('1. Lifecycle State Machine Determinism', () => {
    it('allows valid progressive lifecycle transitions (initiated -> uploaded -> scanning -> processing -> ready)', () => {
      assert.equal(canTransition('initiated', 'uploaded'), true);
      assert.equal(canTransition('uploaded', 'scanning'), true);
      assert.equal(canTransition('scanning', 'processing'), true);
      assert.equal(canTransition('processing', 'ready'), true);
    });

    it('allows valid failure state transitions', () => {
      // From initiated
      assert.equal(canTransition('initiated', 'failed'), true);
      assert.equal(canTransition('initiated', 'rejected'), true);

      // From uploaded
      assert.equal(canTransition('uploaded', 'failed'), true);
      assert.equal(canTransition('uploaded', 'quarantined'), true);
      assert.equal(canTransition('uploaded', 'rejected'), true);

      // From scanning
      assert.equal(canTransition('scanning', 'failed'), true);
      assert.equal(canTransition('scanning', 'quarantined'), true);
      assert.equal(canTransition('scanning', 'rejected'), true);

      // From processing
      assert.equal(canTransition('processing', 'failed'), true);
      assert.equal(canTransition('processing', 'quarantined'), true);
      assert.equal(canTransition('processing', 'rejected'), true);
    });

    it('allows retrying from failed when processingAttempts < 3', () => {
      assert.equal(canTransition('failed', 'scanning', 0), true);
      assert.equal(canTransition('failed', 'processing', 1), true);
      assert.equal(canTransition('failed', 'scanning', 2), true);
      assert.equal(canTransition('failed', 'scanning', 3), false);
      assert.equal(canTransition('failed', 'processing', 4), false);
    });

    it('strictly prohibits terminal state transitions and self-loops with 409 Conflict', () => {
      // Ready terminal
      assert.equal(canTransition('ready', 'scanning'), false);
      assert.equal(canTransition('ready', 'processing'), false);
      assert.equal(canTransition('ready', 'ready'), false);
      assert.throws(() => validateTransition('ready', 'scanning'), (err) => err.statusCode === 409);

      // Rejected terminal
      assert.equal(canTransition('rejected', 'ready'), false);
      assert.throws(() => validateTransition('rejected', 'ready'), (err) => err.statusCode === 409);

      // Quarantined terminal
      assert.equal(canTransition('quarantined', 'ready'), false);
      assert.equal(canTransition('quarantined', 'scanning'), false);
      assert.throws(() => validateTransition('quarantined', 'ready'), (err) => err.statusCode === 409);

      // Illegal forward jumps
      assert.equal(canTransition('initiated', 'ready'), false);
      assert.throws(() => validateTransition('initiated', 'ready'), (err) => err.statusCode === 409);

      assert.equal(canTransition('uploaded', 'ready'), false);
      assert.throws(() => validateTransition('uploaded', 'ready'), (err) => err.statusCode === 409);

      assert.equal(canTransition('scanning', 'ready'), false);
      assert.throws(() => validateTransition('scanning', 'ready'), (err) => err.statusCode === 409);

      // Self-loops
      assert.equal(canTransition('scanning', 'scanning'), false);
      assert.throws(() => validateTransition('scanning', 'scanning'), (err) => err.statusCode === 409);
    });
  });

  describe('2. Creator Quota Validation', () => {
    const ownerId = `test-quota-user-${randomUUID()}`;

    beforeEach(async () => {
      await MediaAsset.deleteMany({ ownerId });
    });

    it('rejects files larger than 50MB with 413 Payload Too Large', async () => {
      await assert.rejects(
        () => checkCreatorQuota(ownerId, 55 * 1024 * 1024),
        (err) => err.statusCode === 413 && err.message.includes('50MB')
      );
    });

    it('rejects non-positive or invalid file sizes with 400 Bad Request', async () => {
      await assert.rejects(
        () => checkCreatorQuota(ownerId, 0),
        (err) => err.statusCode === 400
      );
      await assert.rejects(
        () => checkCreatorQuota(ownerId, -100),
        (err) => err.statusCode === 400
      );
      await assert.rejects(
        () => checkCreatorQuota(ownerId, 'huge'),
        (err) => err.statusCode === 400
      );
    });

    it('accepts files within storage volume and count quotas', async () => {
      const res = await checkCreatorQuota(ownerId, 10 * 1024 * 1024);
      assert.equal(res.currentBytes, 0);
      assert.equal(res.currentCount, 0);
    });

    it('enforces asset count quota (429 when max asset count exceeded)', async () => {
      // Mock or insert assets reaching count limit
      const dummyAssets = Array.from({ length: 100 }, (_, i) => ({
        _id: randomUUID(),
        ownerId,
        kind: 'document',
        status: 'ready',
        purpose: 'educational-resource',
        originalName: `doc_${i}.pdf`,
        sourceMimeType: 'application/pdf',
        sourceSize: 1024,
        fileHash: `hash-${i}`,
      }));
      await MediaAsset.insertMany(dummyAssets);

      await assert.rejects(
        () => checkCreatorQuota(ownerId, 1024),
        (err) => err.statusCode === 429 && err.message.includes('count quota exceeded')
      );
    });

    it('enforces storage volume quota (429 when total volume exceeded)', async () => {
      // Insert one large asset occupying 1GB minus 1000 bytes
      const maxBytes = env.MEDIA_CREATOR_MAX_STORAGE_BYTES;
      await MediaAsset.create({
        _id: randomUUID(),
        ownerId,
        kind: 'document',
        status: 'ready',
        purpose: 'educational-resource',
        originalName: 'large.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: maxBytes - 500,
        fileHash: 'sha256-dummy',
      });

      // Attempting to add 1000 bytes should exceed maxBytes and reject with 429
      await assert.rejects(
        () => checkCreatorQuota(ownerId, 1000),
        (err) => err.statusCode === 429 && err.message.includes('volume quota exceeded')
      );
    });

    it('allows admin users to bypass creator count and volume quotas', async () => {
      const maxBytes = env.MEDIA_CREATOR_MAX_STORAGE_BYTES;
      await MediaAsset.create({
        _id: randomUUID(),
        ownerId,
        kind: 'document',
        status: 'ready',
        purpose: 'educational-resource',
        originalName: 'admin_large.pdf',
        sourceMimeType: 'application/pdf',
        sourceSize: maxBytes,
        fileHash: 'sha256-admin',
      });

      const res = await checkCreatorQuota(ownerId, 10 * 1024 * 1024, 'admin');
      assert.equal(res.currentBytes, 0);
    });
  });

  describe('3. Cryptographic Token Generation and Verification', () => {
    const assetId = randomUUID();
    const ownerId = `test-crypto-owner-${randomUUID()}`;

    it('generates and verifies signed uploadToken with scope and audience checks', () => {
      const token = createSignedUploadToken(assetId, ownerId);
      assert.ok(token);

      const decoded = verifySignedUploadToken(token, assetId);
      assert.equal(decoded.assetId, assetId);
      assert.equal(decoded.ownerId, ownerId);
      assert.equal(decoded.scope, 'educational-upload');
      assert.equal(decoded.aud, 'quizfocus-media');
      assert.equal(decoded.iss, 'quizfocus-media-service');
    });

    it('rejects uploadToken when target assetId does not match', () => {
      const otherId = randomUUID();
      const token = createSignedUploadToken(assetId, ownerId);
      assert.throws(
        () => verifySignedUploadToken(token, otherId),
        (err) => err.statusCode === 403
      );
    });

    it('rejects uploadToken signed with a different key or tampered payload', () => {
      const forged = jwt.sign(
        { assetId, ownerId, scope: 'educational-upload' },
        'wrong-secret-key-that-does-not-match-at-all-32b',
        { audience: 'quizfocus-media', issuer: 'quizfocus-media-service' }
      );
      assert.throws(
        () => verifySignedUploadToken(forged, assetId),
        (err) => err.statusCode === 401
      );
    });

    it('rejects expired uploadToken', () => {
      const expired = jwt.sign(
        { assetId, ownerId, scope: 'educational-upload' },
        env.JWT_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '0s',
          audience: 'quizfocus-media',
          issuer: 'quizfocus-media-service',
        }
      );
      assert.throws(
        () => verifySignedUploadToken(expired, assetId),
        (err) => err.statusCode === 401
      );
    });

    it('generates and verifies signed accessGrant token', () => {
      const grant = createSignedAccessGrant(assetId, ownerId, 'user');
      assert.ok(grant);

      const decoded = verifySignedAccessGrant(grant, assetId);
      assert.equal(decoded.assetId, assetId);
      assert.equal(decoded.viewerId, ownerId);
      assert.equal(decoded.scope, 'educational-access');
    });

    it('rejects accessGrant with incorrect scope or wrong asset target', () => {
      const wrongScope = jwt.sign(
        { assetId, viewerId: ownerId, scope: 'different-scope' },
        env.JWT_SECRET,
        { audience: 'quizfocus-media', issuer: 'quizfocus-media-service' }
      );
      assert.throws(
        () => verifySignedAccessGrant(wrongScope, assetId),
        (err) => err.statusCode === 403
      );
    });
  });

  describe('4. Full Lifecycle & Endpoints via HTTP', () => {
    const creatorId = `test-creator-${randomUUID()}`;
    const testUser = { id: creatorId, role: 'user' };
    let testAssetId;
    let testUploadToken;
    let testContentBuffer;
    let expectedSha256;

    before(() => {
      testContentBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (QuizFocus Test) >>\nendobj\ntrailer\n<<>>\n%%EOF');
      expectedSha256 = crypto.createHash('sha256').update(testContentBuffer).digest('hex');
    });

    it('POST /api/v1/media/assets/initiate: initiates asset upload session and returns signed uploadToken', async () => {
      // We simulate an authenticated user request
      const payload = {
        filename: 'Calculus_Workbook.pdf',
        mimeType: 'application/pdf',
        fileSize: testContentBuffer.length,
        checksumSha256: expectedSha256,
        purpose: 'educational-resource',
        assetType: 'document',
      };

      const result = await initiateEducationalAsset(payload, testUser);
      assert.ok(result.assetId);
      assert.equal(result.status, 'initiated');
      assert.ok(result.uploadUrl.includes(result.assetId));
      assert.ok(result.uploadToken);
      assert.ok(result.expiresAt);

      testAssetId = result.assetId;
      testUploadToken = result.uploadToken;

      // Check DB record
      const doc = await MediaAsset.findById(testAssetId);
      assert.ok(doc);
      assert.equal(doc.status, 'initiated');
      assert.equal(doc.fileHash, '');
      assert.equal(doc.originalName, 'Calculus_Workbook.pdf');
      assert.equal(doc.kind, 'document');
    });

    it('POST /api/v1/media/assets/:id/upload: validates uploadToken, stores file, hashes sha256, advances to uploaded', async () => {
      const uploadRes = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/upload?token=${testUploadToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Checksum-Sha256': expectedSha256,
          'X-Filename': 'Calculus_Workbook.pdf',
        },
        body: testContentBuffer,
      });

      assert.equal(uploadRes.status, 200);
      const data = await uploadRes.json();
      assert.equal(data.status, 'uploaded');
      assert.equal(data.fileHash, expectedSha256);
      assert.equal(data.fileSize, testContentBuffer.length);

      // Verify DB record
      const doc = await MediaAsset.findById(testAssetId).select('+sourcePath +content.filePath');
      assert.equal(doc.status, 'uploaded');
      assert.equal(doc.fileHash, expectedSha256);
      assert.equal(doc.checksumSha256, expectedSha256);
      assert.ok(fs.existsSync(doc.content.filePath));
    });

    it('POST /api/v1/media/assets/:id/upload rejects tampered checksum with 400', async () => {
      // Initiate a second asset
      const init = await initiateEducationalAsset(
        {
          filename: 'corrupted.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          purpose: 'educational-resource',
        },
        testUser
      );

      const fakeChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
      const uploadRes = await fetch(`${baseUrl}/api/v1/media/assets/${init.assetId}/upload?token=${init.uploadToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Checksum-Sha256': fakeChecksum,
        },
        body: Buffer.from('some content that does not match the fake checksum'),
      });

      assert.equal(uploadRes.status, 400);
      const data = await uploadRes.json();
      assert.match(data.message, /Checksum mismatch/i);
    });

    it('PATCH /api/v1/media/assets/:id/status: transitions uploaded -> scanning', async () => {
      const res = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scanning' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.asset.status, 'scanning');

      const doc = await MediaAsset.findById(testAssetId);
      assert.equal(doc.status, 'scanning');
      assert.ok(doc.processingLeaseUntil);
    });

    it('PATCH /api/v1/media/assets/:id/status: transitions scanning -> processing', async () => {
      const res = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'processing' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.asset.status, 'processing');
    });

    it('PATCH /api/v1/media/assets/:id/status: transitions processing -> ready, saving metadata and previewRef', async () => {
      const metadata = {
        pageCount: 12,
        extractableText: true,
        author: 'QuizFocus Prof',
      };
      const previewRef = {
        previewType: 'pdf',
        samplePageCount: 3,
        watermarked: true,
        previewUrl: `/api/v1/media/assets/${testAssetId}/preview`,
      };

      const res = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ready',
          metadata,
          previewRef,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.asset.status, 'ready');
      assert.deepEqual(data.asset.metadata.pageCount, 12);
      assert.equal(data.asset.previewRef.samplePageCount, 3);

      const doc = await MediaAsset.findById(testAssetId);
      assert.equal(doc.status, 'ready');
      assert.equal(doc.sanitized, true);
      assert.equal(doc.processingLeaseUntil, undefined);
    });

    it('PATCH /api/v1/media/assets/:id/status rejects invalid jump from ready to scanning with 409', async () => {
      const res = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scanning' }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.match(data.message, /Invalid lifecycle state transition/i);
    });

    it('GET /api/v1/media/assets/:id/access generates signed access grant and download URL', async () => {
      const access = await getEducationalAssetAccess(testAssetId, testUser);
      assert.ok(access.assetId);
      assert.ok(access.accessGrant);
      assert.ok(access.accessUrl.includes(testAssetId));
      assert.ok(access.expiresAt);
    });

    it('GET /api/v1/media/assets/:id/content streams complete file with security headers', async () => {
      const access = await getEducationalAssetAccess(testAssetId, testUser);
      const streamRes = await fetch(`${baseUrl}${access.accessUrl}`);

      assert.equal(streamRes.status, 200);
      assert.equal(streamRes.headers.get('content-type'), 'application/pdf');
      assert.equal(streamRes.headers.get('accept-ranges'), 'bytes');
      assert.equal(streamRes.headers.get('cache-control'), 'private, no-store');
      assert.equal(streamRes.headers.get('x-content-type-options'), 'nosniff');
      assert.match(streamRes.headers.get('content-disposition'), /inline; filename=/);

      const bytes = Buffer.from(await streamRes.arrayBuffer());
      assert.equal(bytes.length, testContentBuffer.length);
      assert.deepEqual(bytes, testContentBuffer);
    });

    it('GET /api/v1/media/assets/:id/content supports HTTP 206 Partial Content range requests', async () => {
      const access = await getEducationalAssetAccess(testAssetId, testUser);
      const rangeRes = await fetch(`${baseUrl}${access.accessUrl}`, {
        headers: {
          Range: 'bytes=0-15',
        },
      });

      assert.equal(rangeRes.status, 206);
      assert.equal(rangeRes.headers.get('content-range'), `bytes 0-15/${testContentBuffer.length}`);
      assert.equal(rangeRes.headers.get('content-length'), '16');

      const chunk = Buffer.from(await rangeRes.arrayBuffer());
      assert.equal(chunk.length, 16);
      assert.deepEqual(chunk, testContentBuffer.subarray(0, 16));
    });

    it('GET /api/v1/media/assets/:id/content rejects invalid ranges with 416', async () => {
      const access = await getEducationalAssetAccess(testAssetId, testUser);
      const rangeRes = await fetch(`${baseUrl}${access.accessUrl}`, {
        headers: {
          Range: 'bytes=99999-999999',
        },
      });

      assert.equal(rangeRes.status, 416);
    });

    it('quarantined assets are isolated on disk and access is blocked with 403', async () => {
      // Initiate and upload an asset to quarantine
      const init = await initiateEducationalAsset(
        {
          filename: 'suspicious_payload.bin',
          mimeType: 'application/octet-stream',
          fileSize: 256,
          purpose: 'educational-resource',
        },
        testUser
      );
      await saveEducationalAssetUpload(init.assetId, init.uploadToken, Buffer.alloc(256, 0x90), 'suspicious_payload.bin');

      // Update to scanning
      await updateEducationalAssetStatus(init.assetId, { status: 'scanning' });

      // Move to quarantined
      const res = await updateEducationalAssetStatus(init.assetId, {
        status: 'quarantined',
        failureReason: 'Detected shellcode in document structure',
      });
      assert.equal(res.asset.status, 'quarantined');
      assert.ok(res.asset.quarantinedAt);

      // Access should now be forbidden
      await assert.rejects(
        () => getEducationalAssetAccess(init.assetId, testUser),
        (err) => err.statusCode === 403 && err.message.includes('quarantined')
      );
    });

    it('route ordering ensures /assets/:id/access and /assets/:id/status are not captured by getAsset', async () => {
      // If Express matched /assets/:id/:variant?, calling /assets/:id/access without image variant would throw 400 'Unsupported image variant'
      // With proper ordering, GET /assets/:id/status returns 200 (or 401 if unauthenticated)
      const statusRes = await fetch(`${baseUrl}/api/v1/media/assets/${testAssetId}/status`);
      // Since requireAuth checks auth and no token was provided, it should return 401, NOT 400 'Unsupported image variant'
      assert.notEqual(statusRes.status, 400);
      assert.equal(statusRes.status, 401);
    });
  });
});
