const express = require('express');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/security');
const { uploadDocument, validateDocumentRequest } = require('../middleware/documentUpload');
const { ROLES } = require('../roles');
const {
  uploadDocumentFile,
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
  updateDocumentValidation
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
