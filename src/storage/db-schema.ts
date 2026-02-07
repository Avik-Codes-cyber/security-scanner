/**
 * Database schema definitions for SQLite storage
 */

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    hostname TEXT,
    platform TEXT,
    command TEXT,
    target_path TEXT NOT NULL,
    scanned_files INTEGER,
    elapsed_ms INTEGER,
    finding_count INTEGER,
    critical_count INTEGER,
    high_count INTEGER,
    medium_count INTEGER,
    low_count INTEGER,
    tags TEXT,
    notes TEXT,
    metadata TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_timestamp ON scans(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_target ON scans(target_path);
  CREATE INDEX IF NOT EXISTS idx_finding_count ON scans(finding_count);
  
  CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    file TEXT NOT NULL,
    line INTEGER,
    message TEXT,
    category TEXT,
    remediation TEXT,
    source TEXT,
    FOREIGN KEY(scan_id) REFERENCES scans(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_scan_findings ON findings(scan_id);
  CREATE INDEX IF NOT EXISTS idx_severity ON findings(severity);
  CREATE INDEX IF NOT EXISTS idx_rule_id ON findings(rule_id);
  
  CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    meta TEXT,
    FOREIGN KEY(scan_id) REFERENCES scans(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_scan_targets ON targets(scan_id);
`;

export const INSERT_SCAN_SQL = `
  INSERT INTO scans (
    id, timestamp, hostname, platform, command, target_path,
    scanned_files, elapsed_ms, finding_count,
    critical_count, high_count, medium_count, low_count,
    tags, notes, metadata
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const INSERT_FINDING_SQL = `
  INSERT INTO findings (
    scan_id, rule_id, severity, file, line, message, category, remediation, source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const INSERT_TARGET_SQL = `
  INSERT INTO targets (scan_id, kind, name, path, meta) VALUES (?, ?, ?, ?, ?)
`;
