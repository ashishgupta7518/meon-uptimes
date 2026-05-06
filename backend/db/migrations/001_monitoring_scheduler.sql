CREATE TABLE IF NOT EXISTS smtp_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) NOT NULL UNIQUE,
  host VARCHAR(255) DEFAULT '',
  port INT DEFAULT 587,
  username VARCHAR(255) DEFAULT '',
  password TEXT,
  from_email VARCHAR(255) DEFAULT '',
  from_name VARCHAR(255) DEFAULT '',
  use_tls TINYINT(1) DEFAULT 1,
  secure TINYINT(1) DEFAULT 0,
  default_recipients JSON NULL,
  last_verified_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_alert_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_name VARCHAR(255) NOT NULL,
  url VARCHAR(2048) NOT NULL UNIQUE,
  recipients JSON NULL,
  enabled TINYINT(1) DEFAULT 1,
  warning_memory_threshold DECIMAL(6,2) NULL,
  down_memory_threshold DECIMAL(6,2) NULL,
  warning_disk_threshold DECIMAL(6,2) NULL,
  down_disk_threshold DECIMAL(6,2) NULL,
  warning_cpu_threshold DECIMAL(6,2) NULL,
  down_cpu_threshold DECIMAL(6,2) NULL,
  timeout_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_states (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_status_events (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_service_metrics (
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
  cpu_usage DECIMAL(8,2) NULL,
  memory_usage DECIMAL(8,2) NULL,
  disk_usage DECIMAL(8,2) NULL,
  ram_used_gb DECIMAL(10,2) NULL,
  response_time_ms INT NULL,
  http_status INT NULL,
  status_reason TEXT,
  last_status VARCHAR(32) DEFAULT 'warning',
  last_checked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_url_day (url, day)
) ENGINE=InnoDB;

-- For existing installations, add these columns if they are missing.
ALTER TABLE service_alert_mappings
  ADD COLUMN warning_memory_threshold DECIMAL(6,2) NULL,
  ADD COLUMN down_memory_threshold DECIMAL(6,2) NULL,
  ADD COLUMN warning_disk_threshold DECIMAL(6,2) NULL,
  ADD COLUMN down_disk_threshold DECIMAL(6,2) NULL,
  ADD COLUMN warning_cpu_threshold DECIMAL(6,2) NULL,
  ADD COLUMN down_cpu_threshold DECIMAL(6,2) NULL,
  ADD COLUMN timeout_ms INT NULL;

ALTER TABLE service_states
  ADD COLUMN http_status INT NULL,
  ADD COLUMN method VARCHAR(16) NULL,
  ADD COLUMN response_time_ms INT NULL,
  ADD COLUMN error TEXT,
  ADD COLUMN metrics JSON NULL,
  ADD COLUMN threshold_breaches JSON NULL,
  ADD COLUMN last_status_reason TEXT,
  ADD COLUMN last_down_alert_at DATETIME NULL,
  ADD COLUMN last_recovery_alert_at DATETIME NULL;

ALTER TABLE service_status_events
  ADD COLUMN http_status INT NULL,
  ADD COLUMN method VARCHAR(16) NULL,
  ADD COLUMN metrics JSON NULL,
  ADD COLUMN threshold_breaches JSON NULL,
  ADD COLUMN status_reason TEXT;

ALTER TABLE daily_service_metrics
  ADD COLUMN cpu_usage DECIMAL(8,2) NULL,
  ADD COLUMN memory_usage DECIMAL(8,2) NULL,
  ADD COLUMN disk_usage DECIMAL(8,2) NULL,
  ADD COLUMN ram_used_gb DECIMAL(10,2) NULL,
  ADD COLUMN response_time_ms INT NULL,
  ADD COLUMN http_status INT NULL,
  ADD COLUMN status_reason TEXT;
