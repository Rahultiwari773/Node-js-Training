const { body, param } = require('express-validator');

const salaryIdValidation = [
  param('id').isMongoId().withMessage('Salary ID must be a valid MongoDB ID')
];

const salaryFields = [
  body('employeeId').isMongoId().withMessage('Employee ID must be a valid MongoDB ID'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
  body('basicSalary').optional().isFloat({ min: 0 }).withMessage('Basic salary must be non-negative'),
  body('allowances').optional().isFloat({ min: 0 }).withMessage('Allowances must be non-negative'),
  body('deductions').optional().isFloat({ min: 0 }).withMessage('Deductions must be non-negative'),
  body('bonus').optional().isFloat({ min: 0 }).withMessage('Bonus must be non-negative'),
  body('overtimePay').optional().isFloat({ min: 0 }).withMessage('Overtime pay must be non-negative'),
  body('payPeriod').optional().isIn(['monthly', 'weekly', 'daily', 'yearly']).withMessage('Invalid pay period'),
  body('paymentDate').optional().isISO8601().withMessage('Payment date must be a valid date'),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'cancelled']).withMessage('Invalid payment status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const createSalaryValidation = salaryFields;

const updateSalaryValidation = [
  body('employeeId').optional().isMongoId().withMessage('Employee ID must be a valid MongoDB ID'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
  body('basicSalary').optional().isFloat({ min: 0 }).withMessage('Basic salary must be non-negative'),
  body('allowances').optional().isFloat({ min: 0 }).withMessage('Allowances must be non-negative'),
  body('deductions').optional().isFloat({ min: 0 }).withMessage('Deductions must be non-negative'),
  body('bonus').optional().isFloat({ min: 0 }).withMessage('Bonus must be non-negative'),
  body('overtimePay').optional().isFloat({ min: 0 }).withMessage('Overtime pay must be non-negative'),
  body('payPeriod').optional().isIn(['monthly', 'weekly', 'daily', 'yearly']).withMessage('Invalid pay period'),
  body('paymentDate').optional().isISO8601().withMessage('Payment date must be a valid date'),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'cancelled']).withMessage('Invalid payment status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

module.exports = {
  salaryIdValidation,
  createSalaryValidation,
  updateSalaryValidation
};