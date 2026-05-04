const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');
const { getServiceStatus } = require('../services/statusProbeService');

const listServices = async (req, res) => {
  res.json({ services: DEFAULT_SERVICES });
};

const readServiceStatus = async (req, res) => {
  const { name, url } = req.query;
  if (!url) {
    res.status(400);
    throw new Error('Missing url parameter');
  }

  const result = await getServiceStatus({ name, url });
  res.json(result);
};

const readServicesStatus = async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    res.status(400);
    throw new Error('Missing urls array');
  }

  const startedAt = Date.now();
  const results = await Promise.all(urls.map((item) => getServiceStatus(item)));
  res.json({
    results,
    cached: results.every((item) => item.cached && !item.pending),
    pending: results.filter((item) => item.pending).length,
    durationMs: Date.now() - startedAt,
  });
};

module.exports = {
  listServices,
  readServiceStatus,
  readServicesStatus,
};
