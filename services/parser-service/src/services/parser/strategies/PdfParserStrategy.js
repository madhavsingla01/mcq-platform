import fs from 'fs';
import zlib from 'zlib';
import { BaseParserStrategy } from './BaseParserStrategy.js';

/**
 * PdfParserStrategy: handles PDF document inspection and parsing (F8 & F9).
 */
export class PdfParserStrategy extends BaseParserStrategy {
  supports(fileType) {
    const norm = String(fileType || '').toLowerCase();
    return norm === 'pdf' || norm === 'application/pdf';
  }

  /**
   * Extracts clean text tokens from PDF stream BT...ET blocks.
   * @param {string} raw
   * @returns {string}
   */
  _extractTextFromStream(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const textPieces = [];
    const btRegex = /BT([\s\S]*?)ET/g;
    let match;

    while ((match = btRegex.exec(raw)) !== null) {
      const block = match[1];
      // Match (text) Tj or ' or "
      const tjRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textPieces.push(tjMatch[1]);
      }

      // Match [ (text) -10 (more text) ] TJ
      const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let arrMatch;
      while ((arrMatch = arrayTjRegex.exec(block)) !== null) {
        const inner = arrMatch[1];
        const innerTjRegex = /\(([^)]*)\)/g;
        let innerMatch;
        while ((innerMatch = innerTjRegex.exec(inner)) !== null) {
          textPieces.push(innerMatch[1]);
        }
      }
    }

    return textPieces
      .map((t) =>
        t
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
      )
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async parse(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await fs.promises.readFile(filePath);
    if (!content || content.length === 0) {
      throw new Error('Failed to parse PDF document: File is empty (0 bytes)');
    }

    // Verify PDF header %PDF-
    const headerPrefix = content.subarray(0, Math.min(content.length, 1024)).toString('binary');
    if (!headerPrefix.includes('%PDF-')) {
      throw new Error('Failed to parse PDF document: Corrupted or invalid PDF structure (missing %PDF- header)');
    }

    const text = content.toString('binary');

    // 1. Detect PDF format version (e.g. %PDF-1.4 -> PDF-1.4)
    let format = 'PDF-1.4';
    const versionMatch = text.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch && versionMatch[1]) {
      format = `PDF-${versionMatch[1]}`;
    }

    // 2. Page count: Look for /Count N in PDF catalog
    let pageCount = 1;
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch && countMatch[1]) {
      pageCount = parseInt(countMatch[1], 10);
    } else {
      // Alternatively count /Type /Page occurrences (ignoring /Pages)
      const pageMatches = text.match(/\/Type\s*\/Page\b/g);
      if (pageMatches && pageMatches.length > 0) {
        pageCount = pageMatches.length;
      }
    }

    // 3. Detect /Encrypt dictionary
    const isEncrypted = /\/Encrypt\b/.test(text);

    // 4. Extract Title if present in info dictionary
    let title = undefined;
    const titleMatch = text.match(/\/Title\s*(?:\(([^)]+)\)|<([^>]+)>)/);
    if (titleMatch) {
      title = (titleMatch[1] || titleMatch[2] || '').trim();
    }

    // 5. Text extraction and searchable flag
    let extractedText = this._extractTextFromStream(text);

    // If uncompressed stream extraction produced nothing, inspect FlateDecode streams
    if (!extractedText) {
      try {
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let sMatch;
        const decompressedPieces = [];
        while ((sMatch = streamRegex.exec(text)) !== null) {
          const rawStream = Buffer.from(sMatch[1], 'binary');
          try {
            const decompressed = zlib.inflateSync(rawStream).toString('utf8');
            const streamText = this._extractTextFromStream(decompressed);
            if (streamText) {
              decompressedPieces.push(streamText);
            }
          } catch {
            // Stream might not be deflated or raw deflate
            try {
              const decompressed = zlib.inflateRawSync(rawStream).toString('utf8');
              const streamText = this._extractTextFromStream(decompressed);
              if (streamText) {
                decompressedPieces.push(streamText);
              }
            } catch {
              // Ignore deflate failure for non-flate stream
            }
          }
        }
        if (decompressedPieces.length > 0) {
          extractedText = decompressedPieces.join(' ').trim();
        }
      } catch {
        // Stream search fallback
      }
    }

    const isTextSearchable = Boolean(extractedText && /\S/.test(extractedText));
    const textSnippet = extractedText ? extractedText.slice(0, 500) : '';

    return {
      headers: ['Page', 'Content'],
      rows: textSnippet ? [{ Page: '1', Content: textSnippet }] : [],
      sheetNames: ['Document'],
      metadata: {
        pageCount,
        format,
        isTextSearchable,
        isEncrypted,
        ...(title ? { title } : {}),
        ...(textSnippet ? { textSnippet } : {}),
      },
    };
  }
}

export default PdfParserStrategy;
