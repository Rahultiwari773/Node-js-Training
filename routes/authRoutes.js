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
	tokenQueryValidation,
	tokenBodyValidation,
	sessionIdValidation,
	twoFactorCodeValidation,
	disableTwoFactorValidation
} = require('../validators/authValidators');

const router = express.Router();

router.post('/register', authLimiter, registerValidation, validate, authController.register);
router.get('/verify-email', authLimiter, tokenQueryValidation, validate, authController.verifyEmail);
router.post('/verify-email', authLimiter, tokenBodyValidation, validate, authController.verifyEmail);
router.post('/resend-verification', authLimiter, emailValidation, validate, authController.resendVerification);
router.post('/login', authLimiter, loginValidation, validate, authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/forgot-password', authLimiter, emailValidation, validate, authController.forgotPassword);
router.get('/reset-password', tokenQueryValidation, validate, authController.resetPasswordPage);
router.post('/reset-password', authLimiter, passwordValidation, validate, authController.resetPassword);
router.get('/profile', authenticate, authController.getProfile);
router.get(
	'/users/accounts',
	authenticate,
	authorize('super_admin', 'admin', 'hr_manager', 'hr'),
	authController.listManagedAccounts
);
router.get(
	'/users/employees',
	authenticate,
	authorize('super_admin', 'admin', 'hr_manager', 'hr'),
	authController.listEmployeeAccounts
);
router.post('/logout', authenticate, authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions/:id', authenticate, sessionIdValidation, validate, authController.revokeSession);
router.post('/2fa/setup', authLimiter, authenticate, passwordValidation, validate, authController.beginTwoFactorSetup);
router.post('/2fa/enable', authLimiter, authenticate, twoFactorCodeValidation, validate, authController.enableTwoFactor);
router.post('/2fa/disable', authLimiter, authenticate, disableTwoFactorValidation, validate, authController.disableTwoFactor);
router.post('/2fa/recovery-codes', authLimiter, authenticate, twoFactorCodeValidation, validate, authController.regenerateRecoveryCodes);
router.post(
	'/users/role',
	authenticate,
	authorize('super_admin', 'admin', 'hr_manager', 'hr'),
	roleValidation,
	validate,
	authController.assignRole
);

module.exports = router;
