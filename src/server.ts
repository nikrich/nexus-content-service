import express from 'express';
import 'express-async-errors';
import type Database from 'better-sqlite3';
import { getDatabase } from './db/client.js';
import healthRoutes from './routes/health.routes.js';
import projectRoutes from './routes/projects.routes.js';
import taskRoutes from './routes/tasks.routes.js';
import { errorHandler, NotFoundError } from './middleware/error.middleware.js';

export interface AppOptions {
  dbPath?: string;
  db?: Database.Database;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.use(express.json());

  // Initialize database
  const db = options.db || getDatabase(options.dbPath);

  // Make db available to routes
  app.set('db', db);

  // Routes
  app.use(healthRoutes);
  app.use(projectRoutes);
  app.use(taskRoutes);

  // 404 handler
  app.use((_req, _res, next) => {
    next(new NotFoundError('Route not found'));
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
