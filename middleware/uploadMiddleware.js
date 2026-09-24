const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const AppError = require('../utils/appError');
const { uploadsRoot, ensureUploadDirectory } = require('../utils/fileStorage');

const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
  ['image/gif', ['.gif']],
  ['application/pdf', ['.pdf']],
  ['application/msword', ['.doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']]
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    ensureUploadDirectory();
    callback(null, uploadsRoot);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

const fileFilter = (req, file, callback) => {
  const extensions = allowedTypes.get(file.mimetype);
  const extension = path.extname(file.originalname).toLowerCase();

  if (!extensions || !extensions.includes(extension)) {
    return callback(new AppError('Only JPG, PNG, GIF, WEBP, PDF, DOC, DOCX, and XLSX files are allowed', 400));
  }

  callback(null, true);
};

const uploadEmployeeFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxFileSize, files: 1 }
});

module.exports = { uploadEmployeeFile, maxFileSize };