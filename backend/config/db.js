const mongoose = require('mongoose');

const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'meon_uptime';

const migrateLegacyCollections = async () => {
  const db = mongoose.connection.db;
  if (!db) {
    return;
  }

  const migrations = [
    ['smtpcredentials', 'smtp_credentials', { key: 'default' }],
    ['servicealertmappings', 'service_alert_mappings', null],
  ];

  for (const [legacyName, currentName, singletonFilter] of migrations) {
    const legacyCollection = db.collection(legacyName);
    const currentCollection = db.collection(currentName);

    if (singletonFilter) {
      const current = await currentCollection.findOne(singletonFilter);
      const legacy = await legacyCollection.findOne(singletonFilter);
      if (!current && legacy) {
        const { _id, ...doc } = legacy;
        await currentCollection.updateOne(singletonFilter, { $set: doc }, { upsert: true });
      }
      continue;
    }

    const currentCount = await currentCollection.countDocuments();
    if (currentCount === 0) {
      const legacyDocs = await legacyCollection.find({}).toArray();
      if (legacyDocs.length > 0) {
        await currentCollection.insertMany(legacyDocs.map(({ _id, ...doc }) => doc));
      }
    }
  }
};

const connectDatabase = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI is not configured. Mongo-backed features are disabled.');
    return false;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: MONGO_DB_NAME });
    await migrateLegacyCollections();
    console.log(`MongoDB connected (${MONGO_DB_NAME})`);
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    return false;
  }
};

const isDatabaseReady = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDatabase,
  isDatabaseReady,
  mongoose,
};
