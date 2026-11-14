import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  processAssetJob,
  sendMediaStatusUpdate,
  MEDIA_SERVICE_URL,
} from '../src/services/parser/jobs.service.js';
import { createParseJob } from '../src/controllers/job.controller.js';
import { memoryCache } from '../src/services/cache/cache.service.js';

describe('Media Service Status Integration & Lifecycle Dispatch', () => {
  const originalFetch = global.fetch;
  let dispatchedUpdates = [];
  let tempFiles = [];

  beforeEach(() => {
    dispatchedUpdates = [];
    tempFiles = [];

    // Mock global.fetch to intercept calls to Media Service
    global.fetch = jest.fn(async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      dispatchedUpdates.push({
        url,
        method: options?.method,
        body,
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          asset: {
            id: 'mock-asset-id',
            status: body.status,
          },
        }),
      };
    });
  });

  afterEach(async () => {
    global.fetch = originalFetch;

    // Clean up any test fixture files created on disk
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          await fs.promises.unlink(f);
        } catch (e) {
          // ignore
        }
      }
    }
  });

  it('sends PATCH to Media Service with status scanning upon job initiation', async () => {
    const assetId = 'asset_123';
    await sendMediaStatusUpdate(assetId, {
      status: 'scanning',
      leaseToken: 'lease_abc',
    });

    expect(dispatchedUpdates.length).toBe(1);
    expect(dispatchedUpdates[0].url).toBe(`${MEDIA_SERVICE_URL}/api/v1/media/assets/${assetId}/status`);
    expect(dispatchedUpdates[0].method).toBe('PATCH');
    expect(dispatchedUpdates[0].body.status).toBe('scanning');
    expect(dispatchedUpdates[0].body.leaseToken).toBe('lease_abc');
  });

  it('transitions lifecycle to quarantined when a macro workbook is ingested', async () => {
    const tempDir = os.tmpdir();
    const macroPath = path.join(tempDir, `macro_test_${Date.now()}.xlsm`);
    tempFiles.push(macroPath);

    // Write mock macro spreadsheet
    const macroContent = Buffer.concat([
      Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00', 'binary'),
      Buffer.from('xl/vbaProject.bin', 'utf8'),
      Buffer.from('DUMMY_VBA_PAYLOAD'),
    ]);
    await fs.promises.writeFile(macroPath, macroContent);

    const result = await processAssetJob({
      assetId: 'asset_macro_456',
      storagePath: macroPath,
      filename: 'financial-models.xlsm',
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      leaseToken: 'lease_macro',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('quarantined');
    expect(result.failureCode).toBe('MACRO_STREAM_DETECTED');

    // Verify lifecycle dispatches: 1) scanning -> 2) quarantined
    expect(dispatchedUpdates.length).toBe(2);
    expect(dispatchedUpdates[0].body.status).toBe('scanning');
    expect(dispatchedUpdates[1].body.status).toBe('quarantined');
    expect(dispatchedUpdates[1].body.failureCode).toBe('MACRO_STREAM_DETECTED');
    expect(dispatchedUpdates[1].body.leaseToken).toBe('lease_macro');
  });

  it('transitions lifecycle to quarantined when an executable header (PE MZ) is disguised as PDF', async () => {
    const tempDir = os.tmpdir();
    const spoofedPath = path.join(tempDir, `spoofed_pe_${Date.now()}.pdf`);
    tempFiles.push(spoofedPath);

    // PE MZ header
    const peBinary = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      Buffer.from('FAKE_PAYLOAD'),
    ]);
    await fs.promises.writeFile(spoofedPath, peBinary);

    const result = await processAssetJob({
      assetId: 'asset_spoof_789',
      storagePath: spoofedPath,
      filename: 'lecture-notes.pdf',
      mimeType: 'application/pdf',
      leaseToken: 'lease_spoof',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('quarantined');
    expect(result.failureCode).toBe('MALICIOUS_HEADER_DETECTED');

    // Verify status update dispatched quarantined
    const lastUpdate = dispatchedUpdates[dispatchedUpdates.length - 1];
    expect(lastUpdate.body.status).toBe('quarantined');
    expect(lastUpdate.body.failureCode).toBe('MALICIOUS_HEADER_DETECTED');
  });

  it('transitions lifecycle to rejected when an empty file is uploaded', async () => {
    const tempDir = os.tmpdir();
    const emptyPath = path.join(tempDir, `empty_${Date.now()}.csv`);
    tempFiles.push(emptyPath);
    await fs.promises.writeFile(emptyPath, Buffer.alloc(0));

    const result = await processAssetJob({
      assetId: 'asset_empty_001',
      storagePath: emptyPath,
      filename: 'empty.csv',
      mimeType: 'text/csv',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('EMPTY_FILE');

    const lastUpdate = dispatchedUpdates[dispatchedUpdates.length - 1];
    expect(lastUpdate.body.status).toBe('rejected');
    expect(lastUpdate.body.failureCode).toBe('EMPTY_FILE');
  });

  it('completes clean progression scanning -> processing -> ready for valid PDF resource', async () => {
    const tempDir = os.tmpdir();
    const pdfPath = path.join(tempDir, `valid_${Date.now()}.pdf`);
    tempFiles.push(pdfPath);

    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\ntrailer\n<< >>\n%%EOF');
    await fs.promises.writeFile(pdfPath, validPdf);

    const result = await processAssetJob({
      assetId: 'asset_valid_pdf',
      storagePath: pdfPath,
      filename: 'exam-guide.pdf',
      mimeType: 'application/pdf',
      leaseToken: 'lease_valid',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.detectedType).toBe('pdf');

    // Progression: scanning -> processing -> ready
    expect(dispatchedUpdates.length).toBe(3);
    expect(dispatchedUpdates[0].body.status).toBe('scanning');
    expect(dispatchedUpdates[1].body.status).toBe('processing');
    expect(dispatchedUpdates[2].body.status).toBe('ready');
    expect(dispatchedUpdates[2].body.metadata.sanitized).toBe(true);
    expect(dispatchedUpdates[2].body.previewRef.ready).toBe(true);
    expect(dispatchedUpdates[2].body.previewRef.previewType).toBe('pdf');
    expect(dispatchedUpdates[2].body.previewRef.watermarked).toBe(true);
    expect(dispatchedUpdates[2].body.previewRef.samplePageCount).toBe(1);
    expect(dispatchedUpdates[2].body.previewRef.previewUrl).toBe('/api/v1/media/assets/asset_valid_pdf/preview');
    expect(dispatchedUpdates[2].body.previewRef.artifact).toBeDefined();
    expect(dispatchedUpdates[2].body.previewRef.previewData.pdf.samplePageCount).toBe(1);
    expect(dispatchedUpdates[2].body.leaseToken).toBe('lease_valid');

    // Verify preview artifact is cached in memoryCache
    const cachedArtifact = memoryCache.get('preview:asset_valid_pdf');
    expect(cachedArtifact).not.toBeNull();
    expect(cachedArtifact.assetId).toBe('asset_valid_pdf');
    expect(cachedArtifact.contentType).toBe('pdf');
  });

  it('job controller handles POST /api/v1/parser/jobs cleanly and returns structured response', async () => {
    const tempDir = os.tmpdir();
    const csvPath = path.join(tempDir, `controller_test_${Date.now()}.csv`);
    tempFiles.push(csvPath);

    const csvContent = 'Question,Option A,Option B,Correct\nWhat is DNS?,Domain Name System,Data Network Service,A';
    await fs.promises.writeFile(csvPath, Buffer.from(csvContent));

    const req = {
      body: {
        assetId: 'asset_ctrl_999',
        storagePath: csvPath,
        filename: 'questions.csv',
        mimeType: 'text/csv',
      },
    };

    let responseStatus = 0;
    let responseBody = null;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };
    const next = jest.fn();

    await createParseJob(req, res, next);

    expect(responseStatus).toBe(200);
    expect(responseBody).toBeDefined();
    expect(responseBody.success).toBe(true);
    expect(responseBody.status).toBe('ready');
    expect(responseBody.detectedType).toBe('csv');
  });

  it('job controller returns 400 when assetId or storagePath is missing', async () => {
    const req = { body: { assetId: 'only_id' } };
    let responseStatus = 0;
    let responseBody = null;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };
    const next = jest.fn();

    await createParseJob(req, res, next);

    expect(responseStatus).toBe(400);
    expect(responseBody.success).toBe(false);
    expect(responseBody.message).toContain('required');
  });
});
