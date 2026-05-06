const createModel = require('./sqlModelFactory');

module.exports = createModel('service_alert_mappings', {
  jsonFields: ['recipients'],
  uniqueKeys: ['url'],
});
