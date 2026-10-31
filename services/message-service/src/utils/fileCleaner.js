import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

/**
 * Clean up temporary files after processing.
 * @param {string} filePath - Absolute path to file
 */
export const cleanFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.debug(`Cleaned file: ${filePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Failed to clean file: ${filePath}`, error.message);
    }
  }
};

/**
 * Clean all files in a directory older than maxAge.
 * @param {string} dirPath - Directory to clean
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
export const cleanOldFiles = async (dirPath, maxAgeMs = 3600000) => {
  try {
    const files = await fs.readdir(dirPath);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} old files from ${dirPath}`);
    }
  } catch (error) {
    logger.warn(`Failed to clean directory: ${dirPath}`, error.message);
  }
};

export default { cleanFile, cleanOldFiles };
