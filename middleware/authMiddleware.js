const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { jwtSecret } = require('../config/env');

const authenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    const [scheme, token] = authorization ? authorization.split(' ') : [];

    if (scheme !== 'Bearer' || !token) {
      throw new AppError('Authorization token is required', 401);
    }

    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new AppError('Invalid or expired authorization token', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid or expired authorization token', 401));
    }

    next(error);
  }
};

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to access this resource', 403));
  }

  next();
};

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authorize = authorize;
