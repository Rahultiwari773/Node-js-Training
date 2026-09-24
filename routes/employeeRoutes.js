const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/authMiddleware');
const fileAccess = require('../middleware/fileAccessMiddleware');
const { uploadEmployeeFile } = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/security');
const validate = require('../middleware/validate');
const {
  employeeIdValidation,
  fileIdValidation,
  createEmployeeValidation,
  updateEmployeeValidation
} = require('../validators/employeeValidators');
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  uploadFile,
  listFiles,
  downloadFile,
  previewFile,
  deleteFile
} = require('../controllers/employeeController');

const router = express.Router();

router.get('/:id/files/:fileId/preview', fileIdValidation, validate, fileAccess, previewFile);
router.get('/:id/files/:fileId', fileIdValidation, validate, fileAccess, downloadFile);

router.use(authenticate);

router.get('/', authorize('admin', 'hr', 'employee'), getEmployees);
router.get('/:id', employeeIdValidation, validate, authorize('admin', 'hr', 'employee'), getEmployeeById);
router.post('/', createEmployeeValidation, validate, authorize('admin', 'hr'), createEmployee);
router.put('/:id', employeeIdValidation, updateEmployeeValidation, validate, authorize('admin', 'hr'), updateEmployee);
router.delete('/:id', employeeIdValidation, validate, authorize('admin', 'hr'), deleteEmployee);
router.post(
  '/:id/files',
  authorize('admin', 'hr', 'employee'),
  uploadLimiter,
  uploadEmployeeFile.single('file'),
  uploadFile
);
router.get('/:id/files', employeeIdValidation, validate, authorize('admin', 'hr', 'employee'), listFiles);
router.get('/:id/files/:fileId', fileIdValidation, validate, authorize('admin', 'hr', 'employee'), downloadFile);
router.get('/:id/files/:fileId/preview', fileIdValidation, validate, authorize('admin', 'hr', 'employee'), previewFile);
router.delete('/:id/files/:fileId', fileIdValidation, validate, authorize('admin', 'hr'), deleteFile);

module.exports = router;