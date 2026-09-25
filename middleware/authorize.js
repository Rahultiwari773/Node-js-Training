const AppError = require('../utils/appError');
const { isRoleAllowed, ROLE_ALIASES } = require('../roles');

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  const requestedRoles = allowedRoles.flatMap((role) => ROLE_ALIASES[role] || [role]);

  if (!isRoleAllowed(req.user.role, requestedRoles)) {
    return next(new AppError('Access denied', 403));
  }

  next();
};

module.exports = { authorize };
