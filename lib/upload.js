'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const multer = require('multer');
const sharp = require('sharp');

const MAX_PRODUCT_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_PRODUCT_IMAGES_PER_REQUEST = 10;
const PRODUCT_IMAGE_MAX_SIDE = 1800;
const PRODUCT_IMAGE_QUALITY = 86;

const PRODUCT_UPLOAD_DIR = path.join(
  __dirname,
  '..',
  'site',
  'images',
  'products',
);
const PRODUCT_UPLOAD_URL_PREFIX = '/site/images/products/';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_SIZE,
    files: MAX_PRODUCT_IMAGES_PER_REQUEST,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_MIMES.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Допустимы только JPEG, PNG и WebP изображения.');
      error.code = 'UNSUPPORTED_IMAGE_TYPE';
      return callback(error);
    }

    return callback(null, true);
  },
}).array('images', MAX_PRODUCT_IMAGES_PER_REQUEST);

async function ensureProductUploadDir() {
  await fs.mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });
}

function buildProductImageFilename() {
  const timestamp = Date.now();
  const random = crypto.randomUUID().replaceAll('-', '');
  return `${timestamp}-${random}.webp`;
}

async function saveProductImage(buffer) {
  await ensureProductUploadDir();

  const filename = buildProductImageFilename();
  const absolutePath = path.join(PRODUCT_UPLOAD_DIR, filename);

  const sharpOptions = {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  };
  const metadata = await sharp(buffer, sharpOptions).metadata();

  if (!['jpeg', 'png', 'webp'].includes(String(metadata.format || ''))) {
    throw new Error('Файл не является поддерживаемым изображением.');
  }

  await sharp(buffer, sharpOptions)
    .rotate()
    .resize({
      width: PRODUCT_IMAGE_MAX_SIDE,
      height: PRODUCT_IMAGE_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: PRODUCT_IMAGE_QUALITY,
      effort: 4,
    })
    .toFile(absolutePath);

  return `${PRODUCT_UPLOAD_URL_PREFIX}${filename}`;
}

function getManagedProductImageAbsolutePath(imagePath) {
  const normalized = String(imagePath || '').trim().replaceAll('\\', '/');

  if (!normalized.startsWith(PRODUCT_UPLOAD_URL_PREFIX)) {
    return null;
  }

  const filename = normalized.slice(PRODUCT_UPLOAD_URL_PREFIX.length);

  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('..') ||
    path.basename(filename) !== filename
  ) {
    return null;
  }

  return path.join(PRODUCT_UPLOAD_DIR, filename);
}

async function removeManagedProductImage(imagePath) {
  const absolutePath = getManagedProductImageAbsolutePath(imagePath);

  if (!absolutePath) {
    return false;
  }

  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

module.exports = {
  MAX_PRODUCT_IMAGE_SIZE,
  MAX_PRODUCT_IMAGES_PER_REQUEST,
  PRODUCT_UPLOAD_URL_PREFIX,
  productImageUpload,
  saveProductImage,
  removeManagedProductImage,
};
