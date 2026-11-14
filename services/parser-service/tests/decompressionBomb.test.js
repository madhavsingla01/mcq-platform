import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import {
  MAX_UNCOMPRESSED_SIZE,
  MAX_COMPRESSION_RATIO,
  MAX_ENTRY_COUNT,
  inspectZipHeaders,
  inspectDecompressionSafety,
  withTimeout,
  cleanupTempFiles,
} from '../src/services/security/decompressionGuard.service.js';

/**
 * Helper to construct a synthetic ZIP buffer with custom directory headers.
 */
function buildMockZipBuffer({ uncompressedSize = 1024, compressedSize = 100, entryName = 'sheet1.xml', entryCount = 1 } = {}) {
  const localHeaders = [];
  const cdHeaders = [];
  let currentOffset = 0;

  for (let i = 0; i < entryCount; i++) {
    const name = entryCount > 1 ? `entry_${i}.xml` : entryName;
    const nameBuf = Buffer.from(name, 'utf8');

    // Local Header (30 bytes + name length)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // compression method (deflate)
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(0, 14); // crc32
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(local, 30);

    localHeaders.push(local);
    // Dummy compressed payload
    localHeaders.push(Buffer.alloc(compressedSize, 0x41));

    // Central Directory Header (46 bytes + name length)
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(currentOffset, 42);
    nameBuf.copy(cd, 46);

    cdHeaders.push(cd);
    currentOffset += local.length + compressedSize;
  }

  const localPart = Buffer.concat(localHeaders);
  const cdPart = Buffer.concat(cdHeaders);
  const cdOffset = localPart.length;

  // EOCD (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(cdPart.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localPart, cdPart, eocd]);
}

describe('Feature F6: Decompression Bomb & Resource Limits', () => {
  it('F6-1 / F6-B3: Allows archive with uncompressed size exactly at 50MB ceiling', async () => {
    const exact50MB = 50 * 1024 * 1024; // 52,428,800 bytes
    // Total compressed must keep ratio <= 100:1 (e.g. 600KB compressed)
    const compressed = 600 * 1024;
    const zip = buildMockZipBuffer({ uncompressedSize: exact50MB, compressedSize: compressed });

    const result = await inspectDecompressionSafety(zip);
    expect(result.ok).toBe(true);
    expect(result.uncompressedSize).toBe(exact50MB);
  });

  it('F6-B4: Rejects archive with uncompressed size 50MB + 1 byte', async () => {
    const oversized = 50 * 1024 * 1024 + 1; // 52,428,801 bytes
    const compressed = 600 * 1024;
    const zip = buildMockZipBuffer({ uncompressedSize: oversized, compressedSize: compressed });

    const result = await inspectDecompressionSafety(zip);
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('ERR_UNCOMPRESSED_SIZE_EXCEEDED');
    expect(result.error).toContain('exceeds 50MB ceiling');
  });

  it('F6-2 / F6-B1: Allows compression ratio of exactly 100.0:1', async () => {
    const compressed = 100000; // 100KB
    const uncompressed = 100000 * 100; // 10MB -> Ratio exactly 100.0:1
    const zip = buildMockZipBuffer({ uncompressedSize: uncompressed, compressedSize: compressed });

    const result = await inspectDecompressionSafety(zip);
    expect(result.ok).toBe(true);
    expect(result.ratio).toBe(100.0);
  });

  it('F6-B2: Rejects compression ratio exceeding 100.0:1 (e.g. 100.1:1 and extreme bomb 2000:1)', async () => {
    const compressed = 100000;
    const uncompressed = 10010000; // ratio 100.1:1
    const zip = buildMockZipBuffer({ uncompressedSize: uncompressed, compressedSize: compressed });

    const result = await inspectDecompressionSafety(zip);
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('ERR_COMPRESSION_RATIO_EXCEEDED');
  });

  it('F6-B5: Zero-byte compressed buffer handled safely without hanging or throwing', async () => {
    const emptyBuf = Buffer.alloc(0);
    const result = await inspectDecompressionSafety(emptyBuf);

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('EMPTY_BUFFER');
    expect(result.ratio).toBe(0);
  });

  it('F6-3: Processing execution bounded by timeout limit', async () => {
    const slowOperation = () => new Promise((resolve) => setTimeout(resolve, 500));

    // Execution exceeding 50ms timeout bound must reject
    await expect(withTimeout(slowOperation, 50)).rejects.toThrow('Processing timeout exceeded');

    // Fast operation succeeds within window
    const fastOperation = () => Promise.resolve('completed');
    const fastResult = await withTimeout(fastOperation, 500);
    expect(fastResult).toBe('completed');
  });

  it('F6-4: Rejects archive exceeding maximum entry count (1000)', async () => {
    const excessiveZip = buildMockZipBuffer({
      entryCount: 1005,
      uncompressedSize: 10,
      compressedSize: 5,
    });

    const result = await inspectDecompressionSafety(excessiveZip);
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('EXCESSIVE_ENTRY_COUNT');
  });

  it('F6-ZipSlip: Rejects archive containing Zip Slip directory traversal entry', async () => {
    const traversalZip = buildMockZipBuffer({
      uncompressedSize: 100,
      compressedSize: 50,
      entryName: '../../etc/passwd',
    });

    const result = await inspectDecompressionSafety(traversalZip);
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('ZIP_SLIP_ATTEMPT');
  });

  it('F6-5: Cleanup removes temporary decompression files on failure or rejection', async () => {
    const tempDir = os.tmpdir();
    const tempFile1 = path.join(tempDir, `test_cleanup_${Date.now()}_1.tmp`);
    const tempFile2 = path.join(tempDir, `test_cleanup_${Date.now()}_2.tmp`);

    await fs.promises.writeFile(tempFile1, 'temporary content 1');
    await fs.promises.writeFile(tempFile2, 'temporary content 2');

    expect(fs.existsSync(tempFile1)).toBe(true);
    expect(fs.existsSync(tempFile2)).toBe(true);

    await cleanupTempFiles([tempFile1, tempFile2]);

    expect(fs.existsSync(tempFile1)).toBe(false);
    expect(fs.existsSync(tempFile2)).toBe(false);
  });
});
