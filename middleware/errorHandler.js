const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode
    || (error.code === 'LIMIT_FILE_SIZE' ? 400 : null)
    || (error.code === 11000 ? 409 : null)
    || (error.name === 'ValidationError' ? 400 : 500);
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'File size must not exceed 5 MB'
    : error.code === 11000
    ? 'A record with that unique value already exists'
    : error.message || 'Internal server error';

  const response = { success: false, message };
  if (error.details) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
};

const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

module.exports = { errorHandler, notFound };
