const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  return res.status(statusCode).json({ error: error.message || 'Server error' });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
