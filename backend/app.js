const express = require('express');
const cors = require('cors');
const credentialsRoutes = require('./routes/credentialsRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const statusRoutes = require('./routes/statusRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Running');
});

app.use('/api', statusRoutes);
app.use('/api', credentialsRoutes);
app.use('/api', monitoringRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
