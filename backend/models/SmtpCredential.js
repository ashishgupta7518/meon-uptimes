const mongoose = require('mongoose');

const smtpCredentialSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    host: { type: String, trim: true, default: '' },
    port: { type: Number, default: 587 },
    username: { type: String, trim: true, default: '' },
    password: { type: String, default: '', select: false },
    fromEmail: { type: String, trim: true, default: '' },
    fromName: { type: String, trim: true, default: '' },
    useTls: { type: Boolean, default: true },
    secure: { type: Boolean, default: false },
    defaultRecipients: { type: [String], default: [] },
    lastVerifiedAt: Date,
  },
  { timestamps: true, collection: 'smtp_credentials' }
);

module.exports = mongoose.model('SmtpCredential', smtpCredentialSchema);
