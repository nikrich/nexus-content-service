import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware.js';
import { notifyCommentAdded } from './notification.client.js';

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CommentService {
  constructor(private db: Database.Database) {}

  createComment(taskId: string, authorId: string, body: string): Comment {
    // Verify task exists
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string; project_id: string; title: string; assignee_id: string | null; created_by: string;
    } | undefined;
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Verify author is a project member
    this.ensureMember(task.project_id, authorId);

    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO comments (id, task_id, author_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, authorId, body, now, now);

    // Fire-and-forget notification to task assignee and creator
    const notifyUserIds: string[] = [];
    if (task.assignee_id) notifyUserIds.push(task.assignee_id);
    if (task.created_by && !notifyUserIds.includes(task.created_by)) {
      notifyUserIds.push(task.created_by);
    }
    notifyCommentAdded(taskId, task.title, authorId, notifyUserIds);

    return {
      id,
      taskId,
      authorId,
      body,
      createdAt: now,
      updatedAt: now,
    };
  }

  listComments(taskId: string, userId: string): Comment[] {
    // Verify task exists
    const task = this.db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId) as {
      project_id: string;
    } | undefined;
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Verify user is a project member
    this.ensureMember(task.project_id, userId);

    const rows = this.db.prepare(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC'
    ).all(taskId) as CommentRow[];

    return rows.map(toComment);
  }

  deleteComment(commentId: string, userId: string, userRole: string): void {
    const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as CommentRow | undefined;
    if (!row) {
      throw new NotFoundError('Comment not found');
    }

    // Only author or admin can delete
    if (row.author_id !== userId && userRole !== 'admin') {
      throw new ForbiddenError('Only the comment author or admin can delete comments');
    }

    this.db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
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
