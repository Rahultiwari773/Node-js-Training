const express = require('express');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/security');
const { uploadDocument, validateDocumentRequest } = require('../middleware/documentUpload');
const { ROLES } = require('../roles');
const {
  uploadDocumentFile,
  initiateChunkedDocumentUpload,
  uploadDocumentChunk,
  completeChunkedDocumentUpload,
  cancelChunkedDocumentUpload,
  getDocuments,
  getDocumentById,
  extractDocumentOcr,
  previewDocumentFile,
  updateDocument,
  deleteDocument
} = require('../controllers/documentController');
const {
  uploadDocumentValidation,
  listDocumentsValidation,
  updateDocumentValidation,
  initiateChunkedUploadValidation,
  chunkedUploadIdValidation
} = require('../validators/documentValidators');

const router = express.Router();
const managementRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER];
const viewRoles = [...managementRoles, ROLES.MANAGER, ROLES.EMPLOYEE];

router.use(authenticate);

router.post(
  '/upload',
  authorize(...managementRoles, ROLES.EMPLOYEE),
  uploadLimiter,
  uploadDocument.single('file'),
  uploadDocumentValidation,
  validateDocumentRequest,
  uploadDocumentFile
);

router.post(
  '/uploads',
  authorize(...managementRoles, ROLES.EMPLOYEE),
  uploadLimiter,
  initiateChunkedUploadValidation,
  validate,
  initiateChunkedDocumentUpload
);

router.put(
  '/uploads/:uploadId/chunks/:chunkIndex',
  uploadLimiter,
  chunkedUploadIdValidation,
  validate,
  uploadDocumentChunk
);

router.post(
  '/uploads/:uploadId/complete',
  chunkedUploadIdValidation,
  validate,
  completeChunkedDocumentUpload
);

router.delete(
  '/uploads/:uploadId',
  chunkedUploadIdValidation,
  validate,
  cancelChunkedDocumentUpload
);

router.get(
  '/',
  authorize(...viewRoles),
  listDocumentsValidation,
  validate,
  getDocuments
);

router.get(
  '/:id',
  authorize(...viewRoles),
  getDocumentById
);

router.get(
  '/:id/preview',
  authorize(...viewRoles),
  previewDocumentFile
);

router.post(
  '/:id/ocr',
  authorize(...viewRoles),
  extractDocumentOcr
);

router.put(
  '/:id',
  authorize(...managementRoles, ROLES.EMPLOYEE),
  uploadDocument.single('file'),
  updateDocumentValidation,
  validateDocumentRequest,
  updateDocument
);

router.delete(
  '/:id',
  authorize(...managementRoles, ROLES.EMPLOYEE),
  deleteDocument
);

module.exports = router;
