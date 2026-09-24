const { body, param } = require('express-validator');

const employeeIdValidation = [
  param('id').isMongoId().withMessage('Employee ID must be a valid MongoDB ID')
];

const fileIdValidation = [
  ...employeeIdValidation,
  param('fileId').isMongoId().withMessage('File ID must be a valid MongoDB ID')
];

const employeeFields = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').trim().isEmail().withMessage('A valid employee email is required').normalizeEmail(),
  body('department').trim().notEmpty().withMessage('Department is required'),
  body('role').trim().notEmpty().withMessage('Employee role is required'),
  body('salary').isFloat({ min: 0 }).withMessage('Salary must be a non-negative number')
];

const createEmployeeValidation = employeeFields;

const updateEmployeeValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().trim().isEmail().withMessage('A valid employee email is required').normalizeEmail(),
  body('department').optional().trim().notEmpty().withMessage('Department cannot be empty'),
  body('role').optional().trim().notEmpty().withMessage('Employee role cannot be empty'),
  body('salary').optional().isFloat({ min: 0 }).withMessage('Salary must be a non-negative number')
];

module.exports = {
  employeeIdValidation,
  fileIdValidation,
  createEmployeeValidation,
  updateEmployeeValidation
};