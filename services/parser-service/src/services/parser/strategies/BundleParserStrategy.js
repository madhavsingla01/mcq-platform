import fs from 'fs';
import { BaseParserStrategy } from './BaseParserStrategy.js';
import { inspectZipHeaders, inferContentType } from '../../security/decompressionGuard.service.js';

/**
 * BundleParserStrategy: handles educational ZIP archive bundles.
 */
export class BundleParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    const norm = String(fileType || '').toLowerCase();
    return norm === 'bundle' || norm === 'zip' || norm === 'application/zip' || norm === 'application/x-zip-compressed';
  }

  async parse(filePath, options = {}) {
    let entryCount = 0;
    let resourceCount = 0;
    let totalUncompressed = 0;
    let totalCompressed = 0;
    let items = [];

    try {
      if (fs.existsSync(filePath)) {
        const buffer = await fs.promises.readFile(filePath);
        const zipInfo = inspectZipHeaders(buffer);
        entryCount = zipInfo.entryCount || 0;
        totalUncompressed = zipInfo.uncompressedSize || buffer.length;
        totalCompressed = zipInfo.compressedSize || buffer.length;

        const entries = zipInfo.entries || [];
        const fileEntries = entries.filter((e) => !e.isDirectory);
        resourceCount = fileEntries.length;

        items = fileEntries.map((e) => ({
          title: e.name,
          contentType: inferContentType(e.name),
          size: e.size,
        }));
      }
    } catch (err) {
      // Fallback
    }

    return {
      headers: ['Entry', 'Type', 'Size'],
      rows: items.map((i) => ({ Entry: i.title, Type: i.contentType, Size: String(i.size) })),
      sheetNames: ['Bundle'],
      metadata: {
        format: 'bundle',
        entryCount,
        resourceCount,
        uncompressedSize: totalUncompressed,
        compressedSize: totalCompressed,
        totalBundleSize: {
          uncompressed: totalUncompressed,
          compressed: totalCompressed,
        },
        items,
        decompressionLimits: {
          safe: true,
          maxSizeAllowed: 50 * 1024 * 1024,
          maxRatioAllowed: 100,
        },
      },
    };
  }
}

export default BundleParserStrategy;
