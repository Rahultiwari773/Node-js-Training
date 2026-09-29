const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const AppError = require('../utils/appError');
const { jwtSecret } = require('../config/env');

const authenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError('Authorization token is required', 401);
    }

    const payload = jwt.verify(token, jwtSecret);
    if (payload.purpose !== 'access' || !payload.sid) {
      throw new AppError('Invalid or expired authorization token', 401);
    }

    const user = await User.findById(payload.sub);

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new AppError('Invalid or expired authorization token', 401);
    }

    const session = await AuthSession.findOne({
      _id: payload.sid,
      userId: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).select('_id');
    if (!session) throw new AppError('Session is invalid or expired', 401);

    req.user = user;
    req.authSessionId = session._id.toString();
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid or expired authorization token', 401));
    }

    next(error);
  }
};

module.exports = authenticate;
module.exports.authenticate = authenticate;
