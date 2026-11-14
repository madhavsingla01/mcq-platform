/**
 * Decompression Bomb & Resource Limits Defense Service (Feature F6)
 * Enforces uncompressed byte quotas (50MB), expansion ratio bounds (100:1),
 * entry count limits (1000), Zip Slip path traversal defenses, and bounded execution timeouts.
 */

import fs from 'fs';
import zlib from 'zlib';
import { sanitizeErrorPath } from './macroDetector.service.js';

export const MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024; // Exactly 50MB (52,428,800 bytes)
export const MAX_COMPRESSION_RATIO = 100.0; // 100.0:1 maximum compression ratio
export const MAX_ENTRY_COUNT = 1000; // Maximum 1,000 files in an archive
export const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds default timeout (<= 30000ms)

/**
 * Infer content type from filename.
 * @param {string} filename
 * @returns {string}
 */
export function inferContentType(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'xlsx':
    case 'xls':
      return 'spreadsheet';
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'json':
      return 'mcq_bank';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'svg':
      return 'image';
    default:
      return 'document';
  }
}

/**
 * Parses ZIP headers without decompressing payload entries.
 * Inspects End of Central Directory (EOCD) and Central Directory file headers.
 *
 * @param {Buffer} buffer - ZIP buffer
 * @returns {{ ok: boolean, uncompressedSize: number, compressedSize: number, ratio: number, entryCount: number, error?: string, failureCode?: string }}
 */
export function inspectZipHeaders(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      ok: false,
      uncompressedSize: 0,
      compressedSize: 0,
      ratio: 0,
      entryCount: 0,
      error: 'Invalid buffer provided',
      failureCode: 'INVALID_BUFFER',
    };
  }

  // Handle zero-byte compressed buffer safely without divide-by-zero or exception
  if (buffer.length === 0) {
    return {
      ok: false,
      uncompressedSize: 0,
      compressedSize: 0,
      ratio: 0,
      entryCount: 0,
      error: 'Empty buffer (0 bytes)',
      failureCode: 'EMPTY_BUFFER',
    };
  }

  const fileSize = buffer.length;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let entryCount = 0;
  const entries = [];

  // Search backwards for End of Central Directory (EOCD: 0x06054b50)
  let eocdOffset = -1;
  const maxBacktrack = Math.min(buffer.length, 65557); // max comment length 65535 + 22 bytes EOCD
  for (let i = buffer.length - 22; i >= buffer.length - maxBacktrack; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    // EOCD record found
    const declaredEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    let currOffset = cdOffset;
    const cdEnd = Math.min(cdOffset + cdSize, buffer.length);

    while (currOffset < cdEnd - 46 && entryCount < MAX_ENTRY_COUNT + 10) {
      const sig = buffer.readUInt32LE(currOffset);
      if (sig !== 0x02014b50) {
        break;
      }

      entryCount++;
      const compSize = buffer.readUInt32LE(currOffset + 20);
      const uncompSize = buffer.readUInt32LE(currOffset + 24);
      const fileNameLen = buffer.readUInt16LE(currOffset + 28);
      const extraLen = buffer.readUInt16LE(currOffset + 30);
      const commentLen = buffer.readUInt16LE(currOffset + 32);

      // Zip Slip path traversal check
      if (currOffset + 46 + fileNameLen <= buffer.length) {
        const entryName = buffer.toString('utf8', currOffset + 46, currOffset + 46 + fileNameLen);
        if (
          entryName.includes('..') ||
          entryName.startsWith('/') ||
          entryName.startsWith('\\') ||
          /^[A-Za-z]:/.test(entryName)
        ) {
          return {
            ok: false,
            uncompressedSize: totalUncompressed,
            compressedSize: totalCompressed,
            ratio: 0,
            entryCount,
            error: 'File rejected: Path traversal (Zip Slip) attempt detected.',
            failureCode: 'ZIP_SLIP_ATTEMPT',
          };
        }
        const isDir = entryName.endsWith('/') || entryName.endsWith('\\');
        entries.push({
          name: entryName,
          size: uncompSize,
          compressedSize: compSize,
          isDirectory: isDir,
        });
      }

      totalCompressed += compSize;
      totalUncompressed += uncompSize;
      currOffset += 46 + fileNameLen + extraLen + commentLen;
    }
  } else {
    // Fallback: scan local file headers (0x04034b50)
    let offset = 0;
    while (offset < buffer.length - 30) {
      const sig = buffer.readUInt32LE(offset);
      if (sig === 0x04034b50) {
        entryCount++;
        const compSize = buffer.readUInt32LE(offset + 18);
        const uncompSize = buffer.readUInt32LE(offset + 22);
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);

        // Zip Slip check
        if (offset + 30 + fileNameLen <= buffer.length) {
          const entryName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
          if (
            entryName.includes('..') ||
            entryName.startsWith('/') ||
            entryName.startsWith('\\') ||
            /^[A-Za-z]:/.test(entryName)
          ) {
            return {
              ok: false,
              uncompressedSize: totalUncompressed,
              compressedSize: totalCompressed,
              ratio: 0,
              entryCount,
              error: 'File rejected: Path traversal (Zip Slip) attempt detected.',
              failureCode: 'ZIP_SLIP_ATTEMPT',
            };
          }
          const isDir = entryName.endsWith('/') || entryName.endsWith('\\');
          entries.push({
            name: entryName,
            size: uncompSize,
            compressedSize: compSize,
            isDirectory: isDir,
          });
        }

        totalCompressed += compSize;
        totalUncompressed += uncompSize;
        offset += 30 + fileNameLen + extraLen + compSize;
      } else {
        offset++;
      }
    }
  }

  // Calculate compression ratio safely based on compressed entry payload
  const effectiveCompressed = totalCompressed > 0 ? totalCompressed : Math.max(fileSize, 1);
  const ratio = totalUncompressed / effectiveCompressed;

  // Boundary checks:
  // 1. Max Entry Count check
  if (entryCount > MAX_ENTRY_COUNT) {
    return {
      ok: false,
      uncompressedSize: totalUncompressed,
      compressedSize: effectiveCompressed,
      ratio,
      entryCount,
      error: `File rejected: Archive entry count (${entryCount}) exceeds limit of ${MAX_ENTRY_COUNT}.`,
      failureCode: 'EXCESSIVE_ENTRY_COUNT',
    };
  }

  // 2. Max Uncompressed Size check (50MB ceiling: 50MB allowed, 50MB + 1 rejected)
  if (totalUncompressed > MAX_UNCOMPRESSED_SIZE) {
    return {
      ok: false,
      uncompressedSize: totalUncompressed,
      compressedSize: effectiveCompressed,
      ratio,
      entryCount,
      error: `File rejected: Uncompressed archive size (${totalUncompressed} bytes) exceeds 50MB ceiling.`,
      failureCode: 'ERR_UNCOMPRESSED_SIZE_EXCEEDED',
    };
  }

  // 3. Max Compression Ratio check (100.0:1 allowed, >100.0 rejected)
  if (ratio > MAX_COMPRESSION_RATIO) {
    return {
      ok: false,
      uncompressedSize: totalUncompressed,
      compressedSize: effectiveCompressed,
      ratio,
      entryCount,
      error: `File rejected: Compression ratio (${ratio.toFixed(1)}:1) exceeds safety bound of ${MAX_COMPRESSION_RATIO}:1.`,
      failureCode: 'ERR_COMPRESSION_RATIO_EXCEEDED',
    };
  }

  const fileEntries = entries.filter((e) => !e.isDirectory);
  const resourceCount = fileEntries.length;
  const items = fileEntries.map((e) => ({
    title: e.name,
    contentType: inferContentType(e.name),
    size: e.size,
  }));

  return {
    ok: true,
    uncompressedSize: totalUncompressed,
    compressedSize: effectiveCompressed,
    ratio,
    entryCount,
    resourceCount,
    entries,
    items,
  };
}

/**
 * Inspects raw zlib/deflate stream decompression safely with byte-counting guard.
 *
 * @param {Buffer} buffer - Deflated buffer
 * @returns {Promise<{ ok: boolean, uncompressedSize: number, ratio: number, error?: string, failureCode?: string }>}
 */
export async function inspectRawDeflateSafety(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      ok: false,
      uncompressedSize: 0,
      ratio: 0,
      error: 'Empty buffer',
      failureCode: 'EMPTY_BUFFER',
    };
  }

  return new Promise((resolve) => {
    let uncompressedBytes = 0;
    const compressedBytes = buffer.length;

    // Try inflate or inflateRaw
    const inflate = zlib.createInflate();

    inflate.on('data', (chunk) => {
      uncompressedBytes += chunk.length;

      // Check max uncompressed size ceiling
      if (uncompressedBytes > MAX_UNCOMPRESSED_SIZE) {
        inflate.destroy();
        resolve({
          ok: false,
          uncompressedSize: uncompressedBytes,
          ratio: uncompressedBytes / compressedBytes,
          error: `File rejected: Uncompressed stream exceeds 50MB ceiling.`,
          failureCode: 'ERR_UNCOMPRESSED_SIZE_EXCEEDED',
        });
        return;
      }

      // Check compression ratio bound (only when substantial bytes decompressed)
      const ratio = uncompressedBytes / compressedBytes;
      if (ratio > MAX_COMPRESSION_RATIO && uncompressedBytes > 1024) {
        inflate.destroy();
        resolve({
          ok: false,
          uncompressedSize: uncompressedBytes,
          ratio,
          error: `File rejected: Compression ratio (${ratio.toFixed(1)}:1) exceeds 100:1 bound.`,
          failureCode: 'ERR_COMPRESSION_RATIO_EXCEEDED',
        });
        return;
      }
    });

    inflate.on('end', () => {
      const ratio = uncompressedBytes / Math.max(compressedBytes, 1);
      if (uncompressedBytes > MAX_UNCOMPRESSED_SIZE) {
        resolve({
          ok: false,
          uncompressedSize: uncompressedBytes,
          ratio,
          error: 'File rejected: Uncompressed stream exceeds 50MB ceiling.',
          failureCode: 'ERR_UNCOMPRESSED_SIZE_EXCEEDED',
        });
      } else if (ratio > MAX_COMPRESSION_RATIO) {
        resolve({
          ok: false,
          uncompressedSize: uncompressedBytes,
          ratio,
          error: `File rejected: Compression ratio (${ratio.toFixed(1)}:1) exceeds 100:1 bound.`,
          failureCode: 'ERR_COMPRESSION_RATIO_EXCEEDED',
        });
      } else {
        resolve({
          ok: true,
          uncompressedSize: uncompressedBytes,
          ratio,
        });
      }
    });

    inflate.on('error', (err) => {
      // Not a valid zlib stream or corrupt
      resolve({
        ok: false,
        uncompressedSize: uncompressedBytes,
        ratio: 0,
        error: sanitizeErrorPath(`Decompression error: ${err.message}`),
        failureCode: 'DECOMPRESSION_ERROR',
      });
    });

    try {
      inflate.end(buffer);
    } catch (err) {
      resolve({
        ok: false,
        uncompressedSize: 0,
        ratio: 0,
        error: sanitizeErrorPath(err.message),
        failureCode: 'DECOMPRESSION_ERROR',
      });
    }
  });
}

/**
 * Universal decompression safety inspection.
 * Checks ZIP containers (.xlsx, .bundle, .zip) or raw deflated streams.
 *
 * @param {Buffer|string} bufferOrPath - Buffer or file path
 * @returns {Promise<{ ok: boolean, uncompressedSize: number, ratio: number, entryCount?: number, error?: string, failureCode?: string }>}
 */
export async function inspectDecompressionSafety(bufferOrPath) {
  let buffer;
  if (typeof bufferOrPath === 'string') {
    try {
      buffer = await fs.promises.readFile(bufferOrPath);
    } catch (err) {
      return {
        ok: false,
        uncompressedSize: 0,
        ratio: 0,
        error: sanitizeErrorPath(`File read failed: ${err.message}`),
        failureCode: 'FILE_READ_ERROR',
      };
    }
  } else if (Buffer.isBuffer(bufferOrPath)) {
    buffer = bufferOrPath;
  } else {
    return {
      ok: false,
      uncompressedSize: 0,
      ratio: 0,
      error: 'Invalid input for decompression safety check',
      failureCode: 'INVALID_INPUT',
    };
  }

  if (buffer.length === 0) {
    return {
      ok: false,
      uncompressedSize: 0,
      ratio: 0,
      error: 'Empty buffer (0 bytes)',
      failureCode: 'EMPTY_BUFFER',
    };
  }

  // Check if standard ZIP (PK..)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return inspectZipHeaders(buffer);
  }

  // Check if zlib header (0x78)
  if (buffer.length >= 2 && buffer[0] === 0x78) {
    return inspectRawDeflateSafety(buffer);
  }

  // Default: uncompressed / other format
  return {
    ok: true,
    uncompressedSize: buffer.length,
    ratio: 1.0,
    entryCount: 1,
  };
}

/**
 * Executes an async operation with bounded timeout.
 * Guarantees invocation of cleanup hook if timeout or error occurs.
 *
 * @param {Function|Promise} operation - Async function or Promise
 * @param {number} [timeoutMs=15000] - Timeout limit in milliseconds
 * @param {Function} [onCleanup] - Optional cleanup callback
 * @returns {Promise<*>}
 */
export async function withTimeout(operation, timeoutMs = DEFAULT_TIMEOUT_MS, onCleanup = null) {
  const boundedTimeout = Math.min(Math.max(timeoutMs, 100), 30000);
  let timerId = null;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Processing timeout exceeded (${boundedTimeout}ms)`));
      }, boundedTimeout);
    });

    const opPromise = typeof operation === 'function' ? operation() : operation;
    const result = await Promise.race([opPromise, timeoutPromise]);
    return result;
  } catch (err) {
    if (typeof onCleanup === 'function') {
      try {
        await onCleanup();
      } catch (cleanupErr) {
        // Cleanup errors logged without re-throwing
      }
    }
    throw err;
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}

/**
 * Safely removes temporary file paths.
 *
 * @param {string[]} paths - File paths to remove
 */
export async function cleanupTempFiles(paths = []) {
  for (const p of paths) {
    if (p && typeof p === 'string') {
      try {
        if (fs.existsSync(p)) {
          await fs.promises.unlink(p);
        }
      } catch (err) {
        // Ignored in cleanup
      }
    }
  }
}

export default {
  MAX_UNCOMPRESSED_SIZE,
  MAX_COMPRESSION_RATIO,
  MAX_ENTRY_COUNT,
  DEFAULT_TIMEOUT_MS,
  inferContentType,
  inspectZipHeaders,
  inspectRawDeflateSafety,
  inspectDecompressionSafety,
  withTimeout,
  cleanupTempFiles,
};
