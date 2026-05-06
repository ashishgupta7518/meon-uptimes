const createModel = require('./sqlModelFactory');

module.exports = createModel('service_status_events', {
  jsonFields: ['metrics', 'threshold_breaches'],
  uniqueKeys: [],
});
