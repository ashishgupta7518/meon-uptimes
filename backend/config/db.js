const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB_PATH = path.join(BACKEND_ROOT, 'data', 'uptime.sqlite');
const SQLITE_WAL_ENABLED = String(process.env.SQLITE_WAL_ENABLED || 'true').toLowerCase() !== 'false';

const envNumber = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SQLITE_BUSY_TIMEOUT_MS = envNumber('SQLITE_BUSY_TIMEOUT_MS', 5000);

let pool;
let databasePath;

const quoteIdentifier = (identifier) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
};

const resolveDatabasePath = () => {
  const configuredPath = String(process.env.SQLITE_DB_PATH || process.env.DB_PATH || '').trim();
  return configuredPath ? path.resolve(BACKEND_ROOT, configuredPath) : DEFAULT_DB_PATH;
};

class SQLiteDatabase {
  constructor(database) {
    this.database = database;
  }

  query(sql, params = []) {
    const statement = String(sql || '').trim();
    if (/^(SELECT|PRAGMA)\b/i.test(statement)) {
      return this.all(statement, params).then((rows) => [rows]);
    }
    return this.run(statement, params).then((result) => [result]);
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.database.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.database.run(sql, params, function onRun(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          affectedRows: this.changes || 0,
          changedRows: this.changes || 0,
          changes: this.changes || 0,
          insertId: this.lastID || 0,
          lastID: this.lastID || 0,
        });
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.database.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

const openSqliteDatabase = (filename) =>
  new Promise((resolve, reject) => {
    const database = new sqlite3.Database(
      filename,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(database);
      }
    );
  });

const ensureColumn = async (tableName, columnName, definition) => {
  const [rows] = await pool.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (!rows.some((row) => row.name === columnName)) {
    await pool.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${definition}`);
  }
};

const ensureIndex = async (tableName, indexName, createStatement) => {
  const [rows] = await pool.query(`PRAGMA index_list(${quoteIdentifier(tableName)})`);
  if (!rows.some((row) => row.name === indexName)) {
    await pool.query(createStatement);
  }
};

const ensureUpdatedAtTrigger = async (tableName) => {
  await pool.query(`
    CREATE TRIGGER IF NOT EXISTS ${quoteIdentifier(`trg_${tableName}_updated_at`)}
    AFTER UPDATE ON ${quoteIdentifier(tableName)}
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE ${quoteIdentifier(tableName)}
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = OLD.id;
    END
  `);
};

const normalizeServiceMappingNames = async () => {
  for (const service of DEFAULT_SERVICES) {
    await pool.query(
      'UPDATE "service_alert_mappings" SET "service_name" = ? WHERE "url" = ? AND ("service_name" IS NULL OR "service_name" = "" OR "service_name" = "url")',
      [service.name, service.url]
    );
  }
};

const seedDefaultServiceMappings = async () => {
  for (const service of DEFAULT_SERVICES) {
    await pool.query(
      `INSERT INTO "service_alert_mappings" (service_name, url, recipients, enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(url) DO UPDATE SET
         service_name = CASE
           WHEN service_alert_mappings.service_name IS NULL
             OR service_alert_mappings.service_name = ''
             OR service_alert_mappings.service_name = service_alert_mappings.url
           THEN excluded.service_name
           ELSE service_alert_mappings.service_name
         END`,
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
      'SELECT id, url, recipients, enabled FROM "service_alert_mappings" WHERE url IN (?, ?) ORDER BY id',
      [replacement.oldUrl, replacement.newUrl]
    );
    const oldRows = rows.filter((row) => row.url === replacement.oldUrl);
    const newRows = rows.filter((row) => row.url === replacement.newUrl);

    if (oldRows.length > 0 && newRows.length > 0) {
      const primary = newRows[0];
      const recipients = mergeJsonEmailLists(primary.recipients, ...oldRows.map((row) => row.recipients));
      const enabled = [...newRows, ...oldRows].some((row) => Boolean(row.enabled)) ? 1 : 0;
      await pool.query(
        'UPDATE "service_alert_mappings" SET service_name = ?, recipients = ?, enabled = ? WHERE id = ?',
        [replacement.serviceName, JSON.stringify(recipients), enabled, primary.id]
      );
      await pool.query(
        'DELETE FROM "service_alert_mappings" WHERE url = ? AND id <> ?',
        [replacement.oldUrl, primary.id]
      );
      continue;
    }

    if (oldRows.length > 0 && newRows.length === 0) {
      await pool.query(
        'UPDATE "service_alert_mappings" SET service_name = ?, url = ? WHERE url = ?',
        [replacement.serviceName, replacement.newUrl, replacement.oldUrl]
      );
    }
  }
};

const initSqliteTables = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "smtp_credentials" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL UNIQUE,
      host TEXT DEFAULT '',
      port INTEGER DEFAULT 587,
      username TEXT DEFAULT '',
      password TEXT,
      from_email TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      use_tls INTEGER NOT NULL DEFAULT 1,
      secure INTEGER NOT NULL DEFAULT 0,
      default_recipients TEXT,
      last_verified_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "service_alert_mappings" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      recipients TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      warning_memory_threshold REAL,
      down_memory_threshold REAL,
      warning_disk_threshold REAL,
      down_disk_threshold REAL,
      warning_cpu_threshold REAL,
      down_cpu_threshold REAL,
      timeout_ms INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "service_states" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      last_status TEXT DEFAULT 'warning',
      last_checked_at TEXT,
      http_status INTEGER,
      method TEXT,
      response_time_ms INTEGER,
      error TEXT,
      metrics TEXT,
      threshold_breaches TEXT,
      last_status_reason TEXT,
      down_alert_sent INTEGER NOT NULL DEFAULT 0,
      last_alert_at TEXT,
      last_down_alert_at TEXT,
      last_recovery_alert_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "service_status_events" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER DEFAULT 0,
      checked_at TEXT NOT NULL,
      http_status INTEGER,
      method TEXT,
      response_time_ms INTEGER,
      metrics TEXT,
      threshold_breaches TEXT,
      status_reason TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "daily_service_metrics" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      url TEXT NOT NULL,
      day TEXT NOT NULL,
      uptime_ms INTEGER DEFAULT 0,
      downtime_ms INTEGER DEFAULT 0,
      warning_ms INTEGER DEFAULT 0,
      checks INTEGER DEFAULT 0,
      up_checks INTEGER DEFAULT 0,
      down_checks INTEGER DEFAULT 0,
      warning_checks INTEGER DEFAULT 0,
      cpu_usage REAL,
      memory_usage REAL,
      disk_usage REAL,
      ram_used_gb REAL,
      response_time_ms INTEGER,
      http_status INTEGER,
      status_reason TEXT,
      last_status TEXT DEFAULT 'warning',
      last_checked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (url, day)
    )`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumn('smtp_credentials', 'use_tls', '"use_tls" INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('smtp_credentials', 'default_recipients', '"default_recipients" TEXT');
  await ensureColumn('smtp_credentials', 'last_verified_at', '"last_verified_at" TEXT');
  await ensureColumn('service_alert_mappings', 'warning_memory_threshold', '"warning_memory_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'down_memory_threshold', '"down_memory_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'warning_disk_threshold', '"warning_disk_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'down_disk_threshold', '"down_disk_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'warning_cpu_threshold', '"warning_cpu_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'down_cpu_threshold', '"down_cpu_threshold" REAL');
  await ensureColumn('service_alert_mappings', 'timeout_ms', '"timeout_ms" INTEGER');
  await ensureColumn('service_states', 'http_status', '"http_status" INTEGER');
  await ensureColumn('service_states', 'method', '"method" TEXT');
  await ensureColumn('service_states', 'response_time_ms', '"response_time_ms" INTEGER');
  await ensureColumn('service_states', 'error', '"error" TEXT');
  await ensureColumn('service_states', 'metrics', '"metrics" TEXT');
  await ensureColumn('service_states', 'threshold_breaches', '"threshold_breaches" TEXT');
  await ensureColumn('service_states', 'last_status_reason', '"last_status_reason" TEXT');
  await ensureColumn('service_states', 'last_down_alert_at', '"last_down_alert_at" TEXT');
  await ensureColumn('service_states', 'last_recovery_alert_at', '"last_recovery_alert_at" TEXT');
  await ensureColumn('service_status_events', 'http_status', '"http_status" INTEGER');
  await ensureColumn('service_status_events', 'method', '"method" TEXT');
  await ensureColumn('service_status_events', 'metrics', '"metrics" TEXT');
  await ensureColumn('service_status_events', 'threshold_breaches', '"threshold_breaches" TEXT');
  await ensureColumn('service_status_events', 'status_reason', '"status_reason" TEXT');
  await ensureColumn('daily_service_metrics', 'cpu_usage', '"cpu_usage" REAL');
  await ensureColumn('daily_service_metrics', 'memory_usage', '"memory_usage" REAL');
  await ensureColumn('daily_service_metrics', 'disk_usage', '"disk_usage" REAL');
  await ensureColumn('daily_service_metrics', 'ram_used_gb', '"ram_used_gb" REAL');
  await ensureColumn('daily_service_metrics', 'response_time_ms', '"response_time_ms" INTEGER');
  await ensureColumn('daily_service_metrics', 'http_status', '"http_status" INTEGER');
  await ensureColumn('daily_service_metrics', 'status_reason', '"status_reason" TEXT');

  await ensureIndex(
    'smtp_credentials',
    'uniq_smtp_credentials_key',
    'CREATE UNIQUE INDEX IF NOT EXISTS "uniq_smtp_credentials_key" ON "smtp_credentials" ("key")'
  );
  await ensureIndex(
    'service_alert_mappings',
    'uniq_service_alert_mappings_url',
    'CREATE UNIQUE INDEX IF NOT EXISTS "uniq_service_alert_mappings_url" ON "service_alert_mappings" ("url")'
  );
  await ensureIndex(
    'service_states',
    'uniq_service_states_url',
    'CREATE UNIQUE INDEX IF NOT EXISTS "uniq_service_states_url" ON "service_states" ("url")'
  );
  await ensureIndex(
    'service_status_events',
    'idx_url_ended_started',
    'CREATE INDEX IF NOT EXISTS "idx_url_ended_started" ON "service_status_events" ("url", "ended_at", "started_at")'
  );
  await ensureIndex(
    'daily_service_metrics',
    'uniq_daily_service_metrics_url_day',
    'CREATE UNIQUE INDEX IF NOT EXISTS "uniq_daily_service_metrics_url_day" ON "daily_service_metrics" ("url", "day")'
  );

  for (const tableName of [
    'smtp_credentials',
    'service_alert_mappings',
    'service_states',
    'service_status_events',
    'daily_service_metrics',
  ]) {
    await ensureUpdatedAtTrigger(tableName);
  }

  await normalizeDeprecatedServiceUrls();
  await seedDefaultServiceMappings();
  await normalizeServiceMappingNames();
};

const connectDatabase = async () => {
  try {
    databasePath = resolveDatabasePath();
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    const sqliteDatabase = await openSqliteDatabase(databasePath);
    sqliteDatabase.configure('busyTimeout', SQLITE_BUSY_TIMEOUT_MS);
    pool = new SQLiteDatabase(sqliteDatabase);

    await pool.query('PRAGMA foreign_keys = ON');
    await pool.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    if (SQLITE_WAL_ENABLED) {
      await pool.query('PRAGMA journal_mode = WAL');
      await pool.query('PRAGMA synchronous = NORMAL');
    }
    await pool.query('SELECT 1 AS ok');
    await initSqliteTables();

    console.log(`SQLite connected (${databasePath})`);
    return true;
  } catch (error) {
    pool = null;
    console.error('SQLite connection failed:', error.message);
    return false;
  }
};

const getDb = () => pool;

const getDatabasePath = () => databasePath || resolveDatabasePath();

const isDatabaseReady = () => Boolean(pool);

module.exports = {
  connectDatabase,
  getDatabasePath,
  getDb,
  isDatabaseReady,
};
