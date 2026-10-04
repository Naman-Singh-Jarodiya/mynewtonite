import Database from 'better-sqlite3';
import { config } from '../config/index.js';

export function createDatabaseConnection(customPath?: string): Database.Database {
  const dbPath = customPath || config.dbPath;
  const db = new Database(dbPath);

  // High-performance operational pragmas:
  // WAL mode allows concurrent readers to not block writers, and writers to not block readers
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');

  return db;
}
