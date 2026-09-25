const express = require('express');
const { body, param } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../roles');
const {
  createLeave,
  updateLeave,
  getLeaves,
  getLeaveById,
  approveLeave,
  rejectLeave,
  deleteLeave
} = require('../controllers/leaveController');

const router = express.Router();

const leaveValidators = [
  body('leaveType').isIn(['casual', 'sick', 'earned', 'maternity', 'paternity', 'other']).withMessage('Valid leaveType is required'),
  body('startDate').isISO8601().withMessage('Valid startDate is required'),
  body('endDate').isISO8601().withMessage('Valid endDate is required'),
  body('reason').trim().isLength({ min: 5 }).withMessage('Reason must be at least 5 characters long')
];

router.use(authenticate);

router.post(
  '/',
  leaveValidators,
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  createLeave
);
router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getLeaves
);
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid leave id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getLeaveById
);
router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid leave id'),
    body('leaveType').optional().isIn(['casual', 'sick', 'earned', 'maternity', 'paternity', 'other']).withMessage('Valid leaveType is required'),
    body('startDate').optional().isISO8601().withMessage('Valid startDate is required'),
    body('endDate').optional().isISO8601().withMessage('Valid endDate is required'),
    body('reason').optional().trim().isLength({ min: 5 }).withMessage('Reason must be at least 5 characters long')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE),
  updateLeave
);
router.patch(
  '/:id/approve',
  [param('id').isMongoId().withMessage('Invalid leave id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER),
  approveLeave
);
router.patch(
  '/:id/reject',
  [param('id').isMongoId().withMessage('Invalid leave id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER),
  rejectLeave
);
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid leave id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE),
  deleteLeave
);

module.exports = router;
