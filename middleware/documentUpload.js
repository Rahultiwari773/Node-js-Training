const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { validationResult } = require('express-validator');
const AppError = require('../utils/appError');
const { documentsRoot, ensureDocumentsDirectory, removeDocumentFile } = require('../utils/documentStorage');

const maxDocumentSize = 5 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']]
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    ensureDocumentsDirectory();
    callback(null, documentsRoot);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = allowedMimeTypes.get(file.mimetype);

  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return callback(new AppError('Only PDF, JPG, JPEG, and PNG files are allowed', 400));
  }

  callback(null, true);
};

const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxDocumentSize, files: 1 }
});

const validateDocumentRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    if (req.file) removeDocumentFile(req.file.filename);
    return next(new AppError(
      'Validation failed',
      400,
      errors.array({ onlyFirstError: true }).map((error) => ({
        field: error.path,
        location: error.location,
        message: error.msg
      }))
    ));
  }

  next();
};

module.exports = { uploadDocument, maxDocumentSize, validateDocumentRequest };
