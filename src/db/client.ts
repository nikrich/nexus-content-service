import Database from 'better-sqlite3';
import { initializeDatabase } from './schema.js';

let db: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (!db) {
    const path = dbPath || process.env.DATABASE_PATH || 'content-service.db';
    db = new Database(path);
    initializeDatabase(db);
  }
  return db;
}

export function createDatabase(dbPath: string): Database.Database {
  const database = new Database(dbPath);
  initializeDatabase(database);
  return database;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
