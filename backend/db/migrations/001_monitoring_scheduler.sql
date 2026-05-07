PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS "smtp_credentials" (
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
);

CREATE TABLE IF NOT EXISTS "service_alert_mappings" (
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
);

CREATE TABLE IF NOT EXISTS "service_states" (
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
);

CREATE TABLE IF NOT EXISTS "service_status_events" (
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
);

CREATE TABLE IF NOT EXISTS "daily_service_metrics" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_smtp_credentials_key"
  ON "smtp_credentials" ("key");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_service_alert_mappings_url"
  ON "service_alert_mappings" ("url");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_service_states_url"
  ON "service_states" ("url");

CREATE INDEX IF NOT EXISTS "idx_url_ended_started"
  ON "service_status_events" ("url", "ended_at", "started_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_daily_service_metrics_url_day"
  ON "daily_service_metrics" ("url", "day");

CREATE TRIGGER IF NOT EXISTS "trg_smtp_credentials_updated_at"
AFTER UPDATE ON "smtp_credentials"
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE "smtp_credentials" SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS "trg_service_alert_mappings_updated_at"
AFTER UPDATE ON "service_alert_mappings"
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE "service_alert_mappings" SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS "trg_service_states_updated_at"
AFTER UPDATE ON "service_states"
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE "service_states" SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS "trg_service_status_events_updated_at"
AFTER UPDATE ON "service_status_events"
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE "service_status_events" SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS "trg_daily_service_metrics_updated_at"
AFTER UPDATE ON "daily_service_metrics"
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE "daily_service_metrics" SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
