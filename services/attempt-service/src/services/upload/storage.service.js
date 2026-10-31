import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

export const saveFile = async (file, destination = 'originals') => {
  const dest = path.join(UPLOAD_DIR, destination, file.filename);
  await fs.copyFile(file.path, dest);
  return dest;
};

export const getFile = async (filename, directory = 'originals') => {
  return path.join(UPLOAD_DIR, directory, filename);
};

export const deleteFile = async (filename, directory = 'originals') => {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, directory, filename));
  } catch (e) {
    logger.warn(`Failed to delete: ${filename}`);
  }
};
