/**
 * Macro & Executable Rejection Service (Feature F5: Macro & Executable Rejection)
 * Detects and rejects macro-enabled spreadsheet files, embedded VBA projects,
 * OLE compound streams, and executable binary headers.
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Macro file extensions requiring case-insensitive rejection
const MACRO_EXTENSIONS = new Set([
  'xlsm',
  'xltm',
  'xlsb',
  'xlam',
  'docm',
  'dotm',
  'pptm',
]);

// Known VBA macro indicators in OLE CFB compound documents (legacy .xls)
export const OLE_VBA_STREAM_NAMES = [
  '_vba_project',
  '_vba_project_cur',
  'vba_project',
  'vbaproject.bin',
  'vba',
  'dir',
];

// Known VBA macro entry indicators in ZIP containers (.xlsx, .xlsm, .bundle)
// Note: 'dir' and 'vba' are strictly excluded because 'dir' is an OLE-only stream
// and DrawingML XML contains legitimate attributes like dir="t" and dir="5400000".
export const ZIP_VBA_ENTRY_NAMES = [
  'vbaproject.bin',
  'vbadata.xml',
];

// Backwards compatibility alias
export const VBA_STREAM_NAMES = OLE_VBA_STREAM_NAMES;

/**
 * Sanitizes an error message or string by stripping internal filesystem paths.
 * Prevents information disclosure (CWE-209).
 *
 * @param {string} message - Raw message
 * @returns {string} - Sanitized message
 */
export function sanitizeErrorPath(message) {
  if (typeof message !== 'string') return String(message || '');

  // Strip Windows drive paths (e.g. C:\Users\...) and POSIX paths (/home/..., /var/upload/..., mcq-platform/...)
  return message
    .replace(/[A-Za-z]:\\[^"'\n\r\t<>]+/g, '[internal-storage-path]')
    .replace(/\/(?:home|var|tmp|etc|usr|app|mcq-platform)[^"'\n\r\t<>]+/g, '[internal-storage-path]')
    .replace(/[C-Z]:[\\/][^"'\n\r\t<>]+/gi, '[internal-storage-path]');
}

/**
 * Checks if a filename has a macro-enabled extension (case-insensitive).
 *
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
export function isMacroExtension(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  return MACRO_EXTENSIONS.has(ext);
}

/**
 * Scans a byte buffer for executable binary signatures.
 * Detects Windows PE (MZ), Linux ELF, Mach-O, and Shell Script Shebang.
 *
 * @param {Buffer} buffer - Header buffer
 * @returns {{ isExecutable: boolean, type?: string, reason?: string }}
 */
export function scanExecutableSignatures(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    return { isExecutable: false };
  }

  // Windows PE (MZ) header: 0x4D, 0x5A
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      isExecutable: true,
      type: 'PE',
      reason: 'Windows PE executable (MZ header) detected',
    };
  }

  // Linux ELF header: 0x7F, 'E', 'L', 'F' (0x7F, 0x45, 0x4C, 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      isExecutable: true,
      type: 'ELF',
      reason: 'Linux ELF executable signature detected',
    };
  }

  // Mach-O binaries (32-bit & 64-bit, big & little endian, and Fat binary)
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0);
    if (
      magic === 0xfeedface || // 32-bit Mach-O
      magic === 0xfeedfacf || // 64-bit Mach-O
      magic === 0xcefaedfe || // 32-bit reverse
      magic === 0xcffaedfe || // 64-bit reverse
      magic === 0xcafebabe    // Universal / Fat binary
    ) {
      return {
        isExecutable: true,
        type: 'Mach-O',
        reason: 'Mach-O executable binary header detected',
      };
    }
  }

  // Shell script shebang: #! (0x23 0x21)
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    return {
      isExecutable: true,
      type: 'Script',
      reason: 'Executable shell script shebang (#! ) detected',
    };
  }

  return { isExecutable: false };
}

/**
 * Scans a ZIP archive buffer for VBA macro streams without uncompressing file data.
 * Checks Central Directory records, Local File headers, and specific ZIP entry signatures
 * strictly for vbaproject.bin and vbadata.xml.
 *
 * @param {Buffer} buffer - ZIP archive buffer
 * @returns {{ hasMacros: boolean, streamName?: string }}
 */
export function scanZipForVbaMacros(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { hasMacros: false };
  }

  // Helper to check if a ZIP entry name indicates a VBA macro project
  const isVbaZipEntry = (name) => {
    if (!name || typeof name !== 'string') return false;
    const lower = name.toLowerCase().replace(/\\/g, '/');
    for (const vbaName of ZIP_VBA_ENTRY_NAMES) {
      if (lower.endsWith(vbaName) || lower.includes(vbaName)) {
        return true;
      }
    }
    return false;
  };

  // Structured ZIP entry scan (Central Directory headers: 0x02014b50 and Local File headers: 0x04034b50)
  let offset = 0;
  while (offset < buffer.length - 30) {
    const sig = buffer.readUInt32LE(offset);

    if (sig === 0x02014b50) {
      // Central directory header (minimum 46 bytes)
      if (offset + 46 <= buffer.length) {
        const fileNameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);

        if (offset + 46 + fileNameLen <= buffer.length) {
          const entryName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen);
          if (isVbaZipEntry(entryName)) {
            return { hasMacros: true, streamName: entryName };
          }
        }

        offset += 46 + fileNameLen + extraLen + commentLen;
        continue;
      }
    } else if (sig === 0x04034b50) {
      // Local file header (minimum 30 bytes)
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);

      if (offset + 30 + fileNameLen <= buffer.length) {
        const entryName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
        if (isVbaZipEntry(entryName)) {
          return { hasMacros: true, streamName: entryName };
        }
      }

      offset += 30 + fileNameLen + extraLen;
      continue;
    }

    offset++;
  }

  // Targeted fallback binary check strictly for ZIP macro entry signatures
  // (handles truncated test mock buffers without valid ZIP headers)
  const bufStr = buffer.toString('binary').toLowerCase();
  for (const vbaName of ZIP_VBA_ENTRY_NAMES) {
    if (bufStr.includes(vbaName)) {
      return { hasMacros: true, streamName: vbaName };
    }
  }

  return { hasMacros: false };
}

/**
 * Scans an OLE Compound Document (CFB, legacy .xls) for embedded VBA streams.
 *
 * @param {Buffer} buffer - OLE file buffer
 * @returns {{ hasMacros: boolean, streamName?: string }}
 */
export function scanOleForVbaMacros(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return { hasMacros: false };
  }

  // OLE2 header: 0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1
  const isOle =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1;

  if (!isOle) {
    return { hasMacros: false };
  }

  // Check using CFB parser if available
  try {
    const cfb = XLSX.CFB.read(buffer, { type: 'buffer' });
    if (cfb && Array.isArray(cfb.FileIndex)) {
      for (const entry of cfb.FileIndex) {
        const name = (entry.name || '').toLowerCase();
        for (const vbaName of OLE_VBA_STREAM_NAMES) {
          if (name.includes(vbaName)) {
            return { hasMacros: true, streamName: entry.name };
          }
        }
      }
    }
  } catch (err) {
    // If CFB parser fails, fallback to binary scan for OLE VBA stream names
    const bufStr = buffer.toString('binary').toLowerCase();
    for (const vbaName of OLE_VBA_STREAM_NAMES) {
      if (bufStr.includes(vbaName)) {
        return { hasMacros: true, streamName: vbaName };
      }
    }
  }

  return { hasMacros: false };
}

/**
 * Master macro and executable detector.
 * Performs multi-stage defense-in-depth inspection:
 * 1. Extension inspection
 * 2. Binary executable headers (PE, ELF, Mach-O, scripts)
 * 3. ZIP container VBA projects (.xlsx, .xlsm, .bundle)
 * 4. OLE container VBA streams (.xls)
 *
 * @param {Object} params
 * @param {string} [params.filePath] - Absolute path to file
 * @param {Buffer} [params.buffer] - File buffer (optional if filePath provided)
 * @param {string} params.filename - Original file name
 * @returns {Promise<{ isClean: boolean, threatType?: string, failureReason?: string, failureCode?: string, status?: string }>}
 */
export async function detectMacrosAndExecutables({ filePath, buffer, filename }) {
  // 1. Extension check
  if (isMacroExtension(filename)) {
    return {
      isClean: false,
      threatType: 'macro',
      failureReason: 'File rejected: Macro-enabled workbooks are not permitted.',
      failureCode: 'MACRO_STREAM_DETECTED',
      status: 'quarantined',
    };
  }

  // Read buffer if not supplied
  let targetBuffer = buffer;
  if (!targetBuffer && filePath) {
    try {
      targetBuffer = await fs.promises.readFile(filePath);
    } catch (err) {
      return {
        isClean: false,
        failureReason: sanitizeErrorPath(`File read failed: ${err.message}`),
        failureCode: 'FILE_READ_ERROR',
        status: 'rejected',
      };
    }
  }

  if (!targetBuffer || targetBuffer.length === 0) {
    return {
      isClean: false,
      failureReason: 'File rejected: File is empty (0 bytes).',
      failureCode: 'EMPTY_FILE',
      status: 'rejected',
    };
  }

  // 2. Executable binary signature inspection
  const execCheck = scanExecutableSignatures(targetBuffer);
  if (execCheck.isExecutable) {
    return {
      isClean: false,
      threatType: 'executable',
      failureReason: sanitizeErrorPath(`File rejected: Dangerous file signature detected (${execCheck.type || 'executable'}).`),
      failureCode: 'MALICIOUS_HEADER_DETECTED',
      status: 'quarantined',
    };
  }

  // 3. ZIP archive inspection (XLSX, ZIP bundles, OOXML)
  const isZip = targetBuffer.length >= 4 && targetBuffer[0] === 0x50 && targetBuffer[1] === 0x4b;
  if (isZip) {
    const zipVba = scanZipForVbaMacros(targetBuffer);
    if (zipVba.hasMacros) {
      return {
        isClean: false,
        threatType: 'macro',
        failureReason: 'File rejected: Embedded macro project detected.',
        failureCode: 'MACRO_STREAM_DETECTED',
        status: 'quarantined',
      };
    }
  }

  // 4. OLE CFB inspection (legacy XLS)
  const isOle =
    targetBuffer.length >= 8 &&
    targetBuffer[0] === 0xd0 &&
    targetBuffer[1] === 0xcf &&
    targetBuffer[2] === 0x11 &&
    targetBuffer[3] === 0xe0;

  if (isOle) {
    const oleVba = scanOleForVbaMacros(targetBuffer);
    if (oleVba.hasMacros) {
      return {
        isClean: false,
        threatType: 'macro',
        failureReason: 'File rejected: Embedded VBA macro stream detected in workbook.',
        failureCode: 'MACRO_STREAM_DETECTED',
        status: 'quarantined',
      };
    }
  }

  return { isClean: true };
}

export default {
  isMacroExtension,
  scanExecutableSignatures,
  scanZipForVbaMacros,
  scanOleForVbaMacros,
  sanitizeErrorPath,
  detectMacrosAndExecutables,
};
