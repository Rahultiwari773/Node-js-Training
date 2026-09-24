const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { jwtSecret } = require('../config/env');

const fileAccess = async (req, res, next) => {
  const accessToken = req.query.accessToken;

  if (!accessToken) {
    return next('route');
  }

  try {
    const payload = jwt.verify(accessToken, jwtSecret);

    if (payload.purpose !== 'file-access'
      || payload.employeeId !== req.params.id
      || payload.fileId !== req.params.fileId) {
      throw new AppError('Invalid file access link', 401);
    }

    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new AppError('Invalid or expired file access link', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid or expired file access link', 401));
    }

    next(error);
  }
};

module.exports = fileAccess;