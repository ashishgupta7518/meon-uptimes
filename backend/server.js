const dotenv = require('dotenv');

dotenv.config();

const { connectDatabase } = require('./config/db');
const { startMonitoringScheduler } = require('./services/statusProbeService');
const app = require('./app');

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  await connectDatabase();
  startMonitoringScheduler();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
