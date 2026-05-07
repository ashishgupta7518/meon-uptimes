# Backend Setup

This backend uses a local SQLite database file. No MySQL server is required.

## Install

```bash
npm install
```

## Configure

Copy `.env.example` to `.env` and adjust only the values you need.

```env
SQLITE_DB_PATH=data/uptime.sqlite
SQLITE_WAL_ENABLED=true
SQLITE_BUSY_TIMEOUT_MS=5000
```

`SQLITE_DB_PATH` may be absolute or relative. Relative paths are resolved from the backend directory, so the default works on Windows and Linux and creates `backend/data/uptime.sqlite` automatically.

## Run

```bash
node server.js
```

On startup the app creates the database directory and file if they do not exist, enables SQLite foreign key enforcement, enables WAL mode by default for better read/write concurrency, creates missing tables/indexes/triggers, and seeds the default service mappings.

## Migrations

The SQLite schema is stored in `db/migrations/001_monitoring_scheduler.sql`. Runtime startup also performs safe schema checks for missing columns so older local SQLite files can continue to boot after small schema additions.
