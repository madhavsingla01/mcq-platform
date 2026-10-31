/**
 * Browser-side Image Compression Utility
 * Resizes and compresses images using HTML Canvas before upload,
 * preventing heavy network payload and reducing memory footprint.
 */

/**
 * Compress an image file in the browser.
 * @param {File|Blob} file - Original file from input or drag-and-drop
 * @param {Object} options - Configuration options
 * @param {number} options.maxWidth - Max width in pixels (default 1280)
 * @param {number} options.maxHeight - Max height in pixels (default 720)
 * @param {number} options.quality - Compression quality 0.1 to 1.0 (default 0.82)
 * @param {string} options.outputFormat - 'image/webp' | 'image/jpeg' (default 'image/webp')
 * @returns {Promise<{ file: File, previewUrl: string, originalSize: number, compressedSize: number }>}
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1280,
    maxHeight = 720,
    quality = 0.82,
    outputFormat = 'image/webp',
  } = options;

  if (!file) throw new Error('No file provided for compression');

  // If already small SVG or small image (< 60KB), return as-is
  if (file.type === 'image/svg+xml' || (file.size < 60 * 1024 && file.type === outputFormat)) {
    const previewUrl = URL.createObjectURL(file);
    return {
      file,
      previewUrl,
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => reject(new Error('Failed to parse image data'));

      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Calculate aspect-ratio preserving dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
          // Fallback if canvas context fails
          const previewUrl = URL.createObjectURL(file);
          resolve({ file, previewUrl, originalSize: file.size, compressedSize: file.size });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Determine best supported MIME type
        const format = canvas.toDataURL(outputFormat).startsWith(`data:${outputFormat}`)
          ? outputFormat
          : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              const previewUrl = URL.createObjectURL(file);
              resolve({ file, previewUrl, originalSize: file.size, compressedSize: file.size });
              return;
            }

            const ext = format === 'image/webp' ? '.webp' : '.jpg';
            const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
            const compressedFileName = `${baseName}_compressed${ext}`;

            const compressedFile = new File([blob], compressedFileName, {
              type: format,
              lastModified: Date.now(),
            });

            const previewUrl = URL.createObjectURL(blob);

            resolve({
              file: compressedFile,
              previewUrl,
              originalSize: file.size,
              compressedSize: compressedFile.size,
            });
          },
          format,
          quality
        );
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Fast avatar compressor for square profile images.
 * Resizes to 320x320 and returns base64 dataUrl + File.
 */
export async function compressAvatar(file, size = 320, quality = 0.85) {
  if (!file) throw new Error('No avatar file provided');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read avatar file'));

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => reject(new Error('Failed to parse avatar image'));

      img.onload = () => {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        // Center square crop
        const minDim = Math.min(origW, origH);
        const startX = (origW - minDim) / 2;
        const startY = (origH - minDim) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: e.target.result, file });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/webp', quality);

        canvas.toBlob(
          (blob) => {
            const compressedFile = blob
              ? new File([blob], 'avatar.webp', { type: 'image/webp' })
              : file;

            resolve({
              dataUrl,
              file: compressedFile,
              originalSize: file.size,
              compressedSize: blob ? blob.size : file.size,
            });
          },
          'image/webp',
          quality
        );
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}
