const { body, param, query } = require('express-validator');
const { documentTypes } = require('../models/documentModel');

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

module.exports = {
  uploadDocumentValidation,
  listDocumentsValidation,
  updateDocumentValidation,
  documentIdValidation
};
