const dotenv = require('dotenv');

dotenv.config();

const { connectDatabase } = require('./config/db');
const { startMonitoringScheduler } = require('./services/statusProbeService');
const app = require('./app');

const PORT = 5000;

const startServer = async () => {
  const connected = await connectDatabase();
  if (!connected) {
    throw new Error('Database connection could not be established');
  }
  startMonitoringScheduler();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = app;
