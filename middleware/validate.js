const { validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new AppError(
      'Validation failed',
      400,
      errors.array({ onlyFirstError: true }).map((error) => ({
        field: error.path,
        location: error.location,
        message: error.msg
      }))
    ));
  }

  next();
};

module.exports = validate;