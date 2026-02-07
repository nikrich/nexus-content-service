import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware.js';
import type { PaginatedResult } from './project.service.js';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdBy: string;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
}

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  created_by: string;
  due_date: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    dueDate: row.due_date,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_SORT_FIELDS: Record<string, string> = {
  createdAt: 'created_at',
  dueDate: 'due_date',
  priority: 'priority',
};

const PRIORITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export class TaskService {
  constructor(private db: Database.Database) {}

  createTask(projectId: string, createdBy: string, input: CreateTaskInput): Task {
    this.ensureMember(projectId, createdBy);

    const id = nanoid();
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags || []);

    this.db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, created_by, due_date, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.title,
      input.description || '',
      input.priority || 'medium',
      input.assigneeId || null,
      createdBy,
      input.dueDate || null,
      tags,
      now,
      now,
    );

    return {
      id,
      projectId,
      title: input.title,
      description: input.description || '',
      status: 'todo',
      priority: (input.priority || 'medium') as TaskPriority,
      assigneeId: input.assigneeId || null,
      createdBy,
      dueDate: input.dueDate || null,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
    };
  }

  listTasks(projectId: string, userId: string, filters: TaskFilters): PaginatedResult<Task> {
    this.ensureMember(projectId, userId);

    const page = Math.max(filters.page || 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['t.project_id = ?'];
    const params: unknown[] = [projectId];

    // Filter by status (comma-separated)
    if (filters.status) {
      const statuses = filters.status.split(',').map(s => s.trim());
      conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    // Filter by priority (comma-separated)
    if (filters.priority) {
      const priorities = filters.priority.split(',').map(s => s.trim());
      conditions.push(`t.priority IN (${priorities.map(() => '?').join(',')})`);
      params.push(...priorities);
    }

    // Filter by assignee
    if (filters.assigneeId) {
      conditions.push('t.assignee_id = ?');
      params.push(filters.assigneeId);
    }

    // Search title and description
    if (filters.search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.join(' AND ');

    // Sorting
    let orderClause = 'ORDER BY t.created_at DESC';
    const sortBy = filters.sortBy;
    const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    if (sortBy && sortBy === 'priority') {
      // Custom priority ordering
      orderClause = `ORDER BY CASE t.priority
        WHEN 'critical' THEN 3
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 1
        WHEN 'low' THEN 0
      END ${sortOrder}`;
    } else if (sortBy && VALID_SORT_FIELDS[sortBy]) {
      orderClause = `ORDER BY t.${VALID_SORT_FIELDS[sortBy]} ${sortOrder}`;
    }

    const countRow = this.db.prepare(
      `SELECT COUNT(*) as total FROM tasks t WHERE ${whereClause}`
    ).get(...params) as { total: number };

    const rows = this.db.prepare(
      `SELECT t.* FROM tasks t WHERE ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as TaskRow[];

    const total = countRow.total;
    return {
      items: rows.map(toTask),
      total,
      page,
      pageSize,
      hasMore: offset + rows.length < total,
    };
  }

  getTaskById(taskId: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!row) {
      throw new NotFoundError('Task not found');
    }
    return toTask(row);
  }

  updateTask(taskId: string, userId: string, input: UpdateTaskInput): Task {
    const task = this.getTaskById(taskId);
    this.ensureMember(task.projectId, userId);

    const now = new Date().toISOString();
    const title = input.title ?? task.title;
    const description = input.description ?? task.description;
    const status = input.status ?? task.status;
    const priority = input.priority ?? task.priority;
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId : task.assigneeId;
    const dueDate = input.dueDate !== undefined ? input.dueDate : task.dueDate;
    const tags = input.tags !== undefined ? JSON.stringify(input.tags) : JSON.stringify(task.tags);

    this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, due_date = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, status, priority, assigneeId, dueDate, tags, now, taskId);

    return {
      ...task,
      title,
      description,
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      assigneeId,
      dueDate,
      tags: input.tags !== undefined ? input.tags : task.tags,
      updatedAt: now,
    };
  }

  deleteTask(taskId: string, userId: string): void {
    const task = this.getTaskById(taskId);

    // Only project owner or task creator can delete
    const isProjectOwner = this.db.prepare(
      'SELECT 1 FROM projects WHERE id = ? AND owner_id = ?'
    ).get(task.projectId, userId);

    if (!isProjectOwner && task.createdBy !== userId) {
      throw new ForbiddenError('Only the project owner or task creator can delete tasks');
    }

    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  private ensureMember(projectId: string, userId: string): void {
    const row = this.db.prepare(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, userId);
    if (!row) {
      throw new ForbiddenError('You must be a project member to perform this action');
    }
  }
}
