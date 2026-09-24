const express = require('express');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/security');
const validate = require('../middleware/validate');
const {
	registerValidation,
	loginValidation,
	emailValidation,
	passwordValidation,
	roleValidation,
	tokenQueryValidation
} = require('../validators/authValidators');

const router = express.Router();

router.use(authLimiter);

router.post('/register', registerValidation, validate, authController.register);
router.get('/verify-email', tokenQueryValidation, validate, authController.verifyEmail);
router.post('/resend-verification', emailValidation, validate, authController.resendVerification);
router.post('/login', loginValidation, validate, authController.login);
router.post('/forgot-password', emailValidation, validate, authController.forgotPassword);
router.get('/reset-password', tokenQueryValidation, validate, authController.resetPasswordPage);
router.post('/reset-password', passwordValidation, validate, authController.resetPassword);
router.get('/profile', authenticate, authController.getProfile);
router.post('/logout', authenticate, authController.logout);
router.post(
	'/users/role',
	authenticate,
	authorize('admin'),
	roleValidation,
	validate,
	authController.assignRole
);

module.exports = router;
