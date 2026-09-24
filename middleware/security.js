const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const AppError = require('../utils/appError');
const { allowedOrigins } = require('../config/env');

const securityHeaders = helmet();

const sanitizeRequest = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = mongoSanitize.sanitize(req.body);
    }

    if (req.params && typeof req.params === 'object') {
      req.params = mongoSanitize.sanitize(req.params);
    }

    const sanitizedQuery = mongoSanitize.sanitize(req.query);
    Object.keys(req.query).forEach((key) => delete req.query[key]);
    Object.assign(req.query, sanitizedQuery);
    next();
  } catch (error) {
    next(new AppError('Invalid request data', 400));
  }
};

const corsProtection = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new AppError('Origin is not allowed', 403));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many upload attempts. Please try again later.' }
});

module.exports = {
  securityHeaders,
  corsProtection,
  mongoSanitizeProtection: sanitizeRequest,
  hppProtection: hpp(),
  apiLimiter,
  authLimiter,
  uploadLimiter
};