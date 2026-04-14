/**
 * Database connection.
 * Uses better-sqlite3 for local dev; swap DATABASE_URL to a postgres:// string
 * and replace this file with a pg Pool wrapper for production.
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL ?? './veldex.db';

// Resolve relative paths from the project root
const resolvedPath = dbPath.startsWith('postgres')
  ? dbPath
  : path.resolve(process.cwd(), dbPath);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(resolvedPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
