const express = require('express');
const { body, param } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../roles');
const {
  createLetter,
  updateLetter,
  getLetters,
  getLetterById,
  generateLetter,
  deleteLetter
} = require('../controllers/letterController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('letterType').isIn(['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal']).withMessage('Valid letterType is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').optional().trim(),
    body('employeeId').isMongoId().withMessage('Employee selection is required')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  createLetter
);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getLetters
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid letter id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getLetterById
);

router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid letter id'),
    body('letterType').optional().isIn(['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal']).withMessage('Valid letterType is required'),
    body('title').optional().trim().notEmpty().withMessage('Title is required'),
    body('content').optional().trim().notEmpty().withMessage('Content is required'),
    body('employeeId').optional().isMongoId().withMessage('Invalid employee id')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE),
  updateLetter
);

router.post(
  '/:id/generate',
  [param('id').isMongoId().withMessage('Invalid letter id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  generateLetter
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid letter id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  deleteLetter
);

module.exports = router;
