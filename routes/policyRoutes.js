const express = require('express');
const { body, param } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../roles');
const {
  createPolicy,
  getPolicies,
  getPolicyById,
  updatePolicy,
  deletePolicy
} = require('../controllers/policyController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('status').optional().isIn(['draft', 'published']).withMessage('Invalid policy status')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  createPolicy
);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getPolicies
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid policy id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getPolicyById
);

router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid policy id'),
    body('title').optional().trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim().notEmpty().withMessage('Description is required'),
    body('status').optional().isIn(['draft', 'published']).withMessage('Invalid policy status')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  updatePolicy
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid policy id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  deletePolicy
);

module.exports = router;
