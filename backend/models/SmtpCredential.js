const createModel = require('./sqlModelFactory');

module.exports = createModel('smtp_credentials', {
  jsonFields: ['default_recipients'],
  uniqueKeys: ['key'],
});
