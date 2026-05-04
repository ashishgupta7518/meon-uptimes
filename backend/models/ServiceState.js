const mongoose = require('mongoose');

const serviceStateSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, unique: true },
    lastStatus: { type: String, enum: ['up', 'warning', 'down'], default: 'warning' },
    lastCheckedAt: Date,
    downAlertSent: { type: Boolean, default: false },
    lastAlertAt: Date,
  },
  { timestamps: true, collection: 'service_states' }
);

module.exports = mongoose.model('ServiceState', serviceStateSchema);
