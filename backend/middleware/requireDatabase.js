const { isDatabaseReady } = require('../config/db');

const requireDatabase = (req, res, next) => {
  if (!isDatabaseReady()) {
    return res.status(503).json({ error: 'Database is not connected yet' });
  }
  return next();
};

module.exports = requireDatabase;
