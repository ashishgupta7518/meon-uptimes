const mongoose = require('mongoose');

const dailyServiceMetricSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    day: { type: String, required: true },
    uptimeMs: { type: Number, default: 0 },
    downtimeMs: { type: Number, default: 0 },
    warningMs: { type: Number, default: 0 },
    checks: { type: Number, default: 0 },
    upChecks: { type: Number, default: 0 },
    downChecks: { type: Number, default: 0 },
    warningChecks: { type: Number, default: 0 },
    lastStatus: { type: String, enum: ['up', 'warning', 'down'], default: 'warning' },
    lastCheckedAt: Date,
  },
  { timestamps: true, collection: 'daily_service_metrics' }
);

dailyServiceMetricSchema.index({ url: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('DailyServiceMetric', dailyServiceMetricSchema);
