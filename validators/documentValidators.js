const { body, param, query } = require('express-validator');
const { documentTypes } = require('../models/documentModel');
const { maxDocumentSize } = require('../middleware/documentUpload');

const allowedUploadMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

const documentTypeValidation = body('documentType')
  .isIn(documentTypes)
  .withMessage(`documentType must be one of: ${documentTypes.join(', ')}`);

const employeeIdBodyValidation = body('employeeId')
  .isMongoId()
  .withMessage('employeeId must be a valid MongoDB ID');

const documentIdValidation = param('id')
  .isMongoId()
  .withMessage('Document ID must be a valid MongoDB ID');

const uploadDocumentValidation = [employeeIdBodyValidation, documentTypeValidation];

const listDocumentsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('employeeId').optional().isMongoId().withMessage('employeeId must be a valid MongoDB ID'),
  query('documentType').optional().isIn(documentTypes).withMessage('Invalid documentType'),
  query('status').optional().isIn(['active', 'archived']).withMessage('Invalid document status'),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('search is too long')
];

const updateDocumentValidation = [
  documentIdValidation,
  body('documentType').optional().isIn(documentTypes).withMessage('Invalid documentType'),
  body('status').optional().isIn(['active', 'archived']).withMessage('Invalid document status')
];

const initiateChunkedUploadValidation = [
  body('employeeId').isMongoId().withMessage('employeeId must be a valid MongoDB ID'),
  body('documentType').isIn(documentTypes).withMessage(`documentType must be one of: ${documentTypes.join(', ')}`),
  body('originalFileName')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('originalFileName must be between 1 and 255 characters'),
  body('mimeType')
    .isIn(allowedUploadMimeTypes)
    .withMessage(`mimeType must be one of: ${allowedUploadMimeTypes.join(', ')}`),
  body('fileSize')
    .isInt({ min: 1, max: maxDocumentSize })
    .withMessage(`fileSize must be between 1 and ${maxDocumentSize} bytes`)
];

const chunkedUploadIdValidation = [
  param('uploadId').isUUID().withMessage('uploadId must be a valid UUID')
];

module.exports = {
  uploadDocumentValidation,
  listDocumentsValidation,
  updateDocumentValidation,
  documentIdValidation,
  initiateChunkedUploadValidation,
  chunkedUploadIdValidation
};
