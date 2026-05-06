const mysql = require('mysql2/promise');
const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');

const DB_NAME = process.env.SQL_DB_NAME || 'uptime';
const DB_PORT = Number(process.env.SQL_PORT || 3306);

let pool;

const ensureColumn = async (tableName, columnName, definition) => {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
};

const ensureIndex = async (tableName, indexName, definition) => {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
};

const normalizeServiceMappingNames = async () => {
  for (const service of DEFAULT_SERVICES) {
    await pool.query(
      'UPDATE `service_alert_mappings` SET `service_name` = ? WHERE `url` = ? AND (`service_name` IS NULL OR `service_name` = "" OR `service_name` = `url`)',
      [service.name, service.url]
    );
  }
};

const seedDefaultServiceMappings = async () => {
  for (const service of DEFAULT_SERVICES) {
    await pool.query(
      `INSERT INTO \`service_alert_mappings\` (service_name, url, recipients, enabled)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         service_name = IF(service_name IS NULL OR service_name = '' OR service_name = url, VALUES(service_name), service_name)`,
      [service.name, service.url, '[]']
    );
  }
};

const mergeJsonEmailLists = (...lists) => {
  const emails = lists.flatMap((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  return [...new Set(emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
};

const normalizeDeprecatedServiceUrls = async () => {
  const replacements = [
    {
      serviceName: 'Live',
      oldUrl: 'https://live.meon.co.in/',
      newUrl: 'https://live.meon.co.in/cpu_usage',
    },
  ];

  for (const replacement of replacements) {
    const [rows] = await pool.query(
      'SELECT id, url, recipients, enabled FROM `service_alert_mappings` WHERE url IN (?, ?) ORDER BY id',
      [replacement.oldUrl, replacement.newUrl]
    );
    const oldRows = rows.filter((row) => row.url === replacement.oldUrl);
    const newRows = rows.filter((row) => row.url === replacement.newUrl);

    if (oldRows.length > 0 && newRows.length > 0) {
      const primary = newRows[0];
      const recipients = mergeJsonEmailLists(primary.recipients, ...oldRows.map((row) => row.recipients));
      const enabled = [...newRows, ...oldRows].some((row) => Boolean(row.enabled)) ? 1 : 0;
      await pool.query(
        'UPDATE `service_alert_mappings` SET service_name = ?, recipients = ?, enabled = ? WHERE id = ?',
        [replacement.serviceName, JSON.stringify(recipients), enabled, primary.id]
      );
      await pool.query(
        `DELETE FROM \`service_alert_mappings\` WHERE url = ? AND id <> ?`,
        [replacement.oldUrl, primary.id]
      );
      continue;
    }

    if (oldRows.length > 0 && newRows.length === 0) {
      await pool.query(
        'UPDATE `service_alert_mappings` SET service_name = ?, url = ? WHERE url = ?',
        [replacement.serviceName, replacement.newUrl, replacement.oldUrl]
      );
    }
  }
};

const initMySqlTables = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS \`smtp_credentials\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(255) NOT NULL UNIQUE,
      host VARCHAR(255) DEFAULT '',
      port INT DEFAULT 587,
      username VARCHAR(255) DEFAULT '',
      password TEXT,
      from_email VARCHAR(255) DEFAULT '',
      from_name VARCHAR(255) DEFAULT '',
      use_tls TINYINT(1) DEFAULT 1,
      secure TINYINT(1) DEFAULT 0,
      default_recipients TEXT,
      last_verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`,
    `CREATE TABLE IF NOT EXISTS \`service_alert_mappings\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_name VARCHAR(255) NOT NULL,
      url VARCHAR(2048) NOT NULL UNIQUE,
      recipients TEXT,
      enabled TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`,
    `CREATE TABLE IF NOT EXISTS \`service_states\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_name VARCHAR(255) NOT NULL,
      url VARCHAR(2048) NOT NULL UNIQUE,
      last_status VARCHAR(32) DEFAULT 'warning',
      last_checked_at DATETIME NULL,
      http_status INT NULL,
      method VARCHAR(16) NULL,
      response_time_ms INT NULL,
      error TEXT,
      metrics JSON NULL,
      threshold_breaches JSON NULL,
      last_status_reason TEXT,
      down_alert_sent TINYINT(1) DEFAULT 0,
      last_alert_at DATETIME NULL,
      last_down_alert_at DATETIME NULL,
      last_recovery_alert_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`,
    `CREATE TABLE IF NOT EXISTS \`service_status_events\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_name VARCHAR(255) NOT NULL,
      url VARCHAR(2048) NOT NULL,
      status VARCHAR(32) NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME NULL,
      duration_ms BIGINT DEFAULT 0,
      checked_at DATETIME NOT NULL,
      http_status INT NULL,
      method VARCHAR(16) NULL,
      response_time_ms INT NULL,
      metrics JSON NULL,
      threshold_breaches JSON NULL,
      status_reason TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_url_ended_started (url, ended_at, started_at)
    ) ENGINE=InnoDB;`,
    `CREATE TABLE IF NOT EXISTS \`daily_service_metrics\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_name VARCHAR(255) NOT NULL,
      url VARCHAR(2048) NOT NULL,
      day VARCHAR(20) NOT NULL,
      uptime_ms BIGINT DEFAULT 0,
      downtime_ms BIGINT DEFAULT 0,
      warning_ms BIGINT DEFAULT 0,
      checks INT DEFAULT 0,
      up_checks INT DEFAULT 0,
      down_checks INT DEFAULT 0,
      warning_checks INT DEFAULT 0,
      last_status VARCHAR(32) DEFAULT 'warning',
      last_checked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_url_day (url, day)
    ) ENGINE=InnoDB;`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumn('smtp_credentials', 'use_tls', '`use_tls` TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('smtp_credentials', 'default_recipients', '`default_recipients` JSON NULL');
  await ensureColumn('smtp_credentials', 'last_verified_at', '`last_verified_at` DATETIME NULL');
  await ensureColumn('service_alert_mappings', 'warning_memory_threshold', '`warning_memory_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'down_memory_threshold', '`down_memory_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'warning_disk_threshold', '`warning_disk_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'down_disk_threshold', '`down_disk_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'warning_cpu_threshold', '`warning_cpu_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'down_cpu_threshold', '`down_cpu_threshold` DECIMAL(6,2) NULL');
  await ensureColumn('service_alert_mappings', 'timeout_ms', '`timeout_ms` INT NULL');
  await ensureColumn('service_states', 'http_status', '`http_status` INT NULL');
  await ensureColumn('service_states', 'method', '`method` VARCHAR(16) NULL');
  await ensureColumn('service_states', 'response_time_ms', '`response_time_ms` INT NULL');
  await ensureColumn('service_states', 'error', '`error` TEXT');
  await ensureColumn('service_states', 'metrics', '`metrics` JSON NULL');
  await ensureColumn('service_states', 'threshold_breaches', '`threshold_breaches` JSON NULL');
  await ensureColumn('service_states', 'last_status_reason', '`last_status_reason` TEXT');
  await ensureColumn('service_states', 'last_down_alert_at', '`last_down_alert_at` DATETIME NULL');
  await ensureColumn('service_states', 'last_recovery_alert_at', '`last_recovery_alert_at` DATETIME NULL');
  await ensureColumn('service_status_events', 'http_status', '`http_status` INT NULL');
  await ensureColumn('service_status_events', 'method', '`method` VARCHAR(16) NULL');
  await ensureColumn('service_status_events', 'metrics', '`metrics` JSON NULL');
  await ensureColumn('service_status_events', 'threshold_breaches', '`threshold_breaches` JSON NULL');
  await ensureColumn('service_status_events', 'status_reason', '`status_reason` TEXT');
  await ensureIndex(
    'service_status_events',
    'idx_url_ended_started',
    'INDEX `idx_url_ended_started` (`url`, `ended_at`, `started_at`)'
  );
  await normalizeDeprecatedServiceUrls();
  await seedDefaultServiceMappings();
  await normalizeServiceMappingNames();
};

const connectDatabase = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.SQL_HOST || 'localhost',
      port: DB_PORT,
      user: process.env.SQL_USER || 'root',
      password: process.env.SQL_PASSWORD || '',
      database: DB_NAME,
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await pool.query('SELECT 1');
    await initMySqlTables();
    console.log(`MySQL connected (${DB_NAME})`);
    return true;
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    return false;
  }
};

const getDb = () => pool;

const isDatabaseReady = () => Boolean(pool);

module.exports = {
  connectDatabase,
  getDb,
  isDatabaseReady,
};
