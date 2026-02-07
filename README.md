# Nexus Content Service

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

Core business logic service for the **Nexus** platform. Manages projects, tasks, and comments with full CRUD, filtering, pagination, and inter-service notification triggers.

## Features

- **Projects** — Create, list, update, delete with ownership and member management
- **Tasks** — Full CRUD with advanced filtering (status, priority, assignee, search), sorting, and pagination
- **Comments** — Add, list, and delete comments on tasks
- **Notifications** — Triggers notifications on task assignment, status change, and new comments
- **Authorization** — Role-based access (owner, member, viewer)

## Quick Start

```bash
npm install
npm run dev    # Start with hot reload on port 3002
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with tsx watch |
| `npm run build` | Build with tsup |
| `npm start` | Start production server |
| `npm test` | Run tests |
| `npm run lint` | Type-check |

## API Endpoints

### Projects (auth required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Create project |
| `GET` | `/projects` | List user's projects (paginated) |
| `GET` | `/projects/:id` | Get project details |
| `PATCH` | `/projects/:id` | Update project (owner only) |
| `DELETE` | `/projects/:id` | Delete project (owner only) |
| `POST` | `/projects/:id/members` | Add member (owner only) |
| `DELETE` | `/projects/:id/members/:userId` | Remove member (owner only) |

### Tasks (auth required, project member)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/:projectId/tasks` | Create task |
| `GET` | `/projects/:projectId/tasks` | List tasks (filterable) |
| `GET` | `/tasks/:id` | Get task details |
| `PATCH` | `/tasks/:id` | Update task |
| `DELETE` | `/tasks/:id` | Delete task (owner/creator) |

**Task Filtering** (`GET /projects/:projectId/tasks`):
- `?status=todo,in_progress` — Filter by status
- `?priority=high,critical` — Filter by priority
- `?assigneeId=user123` — Filter by assignee
- `?search=keyword` — Search title and description
- `?sortBy=createdAt|dueDate|priority` — Sort field
- `?sortOrder=asc|desc` — Sort direction
- `?page=1&pageSize=20` — Pagination

### Comments (auth required, project member)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tasks/:taskId/comments` | Add comment |
| `GET` | `/tasks/:taskId/comments` | List comments |
| `DELETE` | `/comments/:id` | Delete comment (author/admin) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Service port |
| `NEXUS_JWT_SECRET` | `nexus-dev-secret-change-in-production` | JWT signing secret |
| `NEXUS_SERVICE_TOKEN` | `nexus-internal-service-token` | Inter-service auth token |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3003` | Notification service URL |
| `DATABASE_PATH` | `./data/content.db` | SQLite database path |

## Database Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id TEXT,
  created_by TEXT NOT NULL,
  due_date TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT, updated_at TEXT
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT, updated_at TEXT
);
```

## Project Structure

```
src/
├── index.ts              # Entry point (port 3002)
├── server.ts             # Express app factory
├── db/
│   ├── schema.ts         # SQLite schema + migrations
│   └── client.ts         # better-sqlite3 connection
├── routes/
│   ├── projects.routes.ts
│   ├── tasks.routes.ts
│   ├── comments.routes.ts
│   └── health.routes.ts
├── services/
│   ├── project.service.ts
│   ├── task.service.ts
│   └── comment.service.ts
└── middleware/
    ├── auth.middleware.ts
    └── error.middleware.ts
```

## Part of Nexus Platform

| Service | Port | Repository |
|---------|------|------------|
| API Gateway | 3000 | [nexus-api-gateway](https://github.com/nikrich/nexus-api-gateway) |
| Shared Contracts | — | [nexus-shared-contracts](https://github.com/nikrich/nexus-shared-contracts) |
| User Service | 3001 | [nexus-user-service](https://github.com/nikrich/nexus-user-service) |
| **Content Service** | **3002** | [nexus-content-service](https://github.com/nikrich/nexus-content-service) |
| Notification Service | 3003 | [nexus-notification-service](https://github.com/nikrich/nexus-notification-service) |
