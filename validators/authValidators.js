const { body, query } = require('express-validator');

const email = (field = 'email') => body(field)
  .trim()
  .isEmail()
  .withMessage('A valid email is required')
  .normalizeEmail();

const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2 to 80 characters'),
  email(),
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const loginValidation = [
  email(),
  body('password').isString().notEmpty().withMessage('Password is required')
];

const emailValidation = [email()];

const passwordValidation = [
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const roleValidation = [
  email(),
  body('role').isIn(['employee', 'hr']).withMessage('Role must be employee or hr')
];

const tokenQueryValidation = [
  query('token').trim().notEmpty().withMessage('Token is required')
];

module.exports = {
  registerValidation,
  loginValidation,
  emailValidation,
  passwordValidation,
  roleValidation,
  tokenQueryValidation
};