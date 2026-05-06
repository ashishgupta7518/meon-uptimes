const createModel = require('./sqlModelFactory');

module.exports = createModel('daily_service_metrics', {
  jsonFields: [],
  uniqueKeys: ['url', 'day'],
});
