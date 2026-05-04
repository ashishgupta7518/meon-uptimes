const mongoose = require('mongoose');

const serviceStatusEventSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['up', 'warning', 'down'], required: true },
    startedAt: { type: Date, required: true },
    endedAt: Date,
    durationMs: { type: Number, default: 0 },
    checkedAt: { type: Date, required: true },
    responseTimeMs: Number,
    error: String,
  },
  { timestamps: true, collection: 'service_status_events' }
);

serviceStatusEventSchema.index({ url: 1, endedAt: 1, startedAt: -1 });

module.exports = mongoose.model('ServiceStatusEvent', serviceStatusEventSchema);
