const createModel = require('./sqlModelFactory');

module.exports = createModel('service_states', {
  jsonFields: ['metrics', 'threshold_breaches'],
  uniqueKeys: ['url'],
});
