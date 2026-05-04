const mongoose = require('mongoose');

const serviceAlertMappingSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, unique: true },
    recipients: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'service_alert_mappings' }
);

module.exports = mongoose.model('ServiceAlertMapping', serviceAlertMappingSchema);
