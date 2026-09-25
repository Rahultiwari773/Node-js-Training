const express = require('express');
const { body, param } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../roles');
const {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement
} = require('../controllers/announcementController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('status').optional().isIn(['draft', 'published']).withMessage('Invalid announcement status')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER),
  createAnnouncement
);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getAnnouncements
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid announcement id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE),
  getAnnouncementById
);

router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid announcement id'),
    body('title').optional().trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim().notEmpty().withMessage('Description is required'),
    body('status').optional().isIn(['draft', 'published']).withMessage('Invalid announcement status')
  ],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  updateAnnouncement
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid announcement id')],
  validate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER),
  deleteAnnouncement
);

module.exports = router;
