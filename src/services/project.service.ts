import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware.js';

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectService {
  constructor(private db: Database.Database) {}

  createProject(name: string, description: string, ownerId: string): Project {
    const id = nanoid();
    const now = new Date().toISOString();

    const insertProject = this.db.prepare(`
      INSERT INTO projects (id, name, description, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMember = this.db.prepare(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (?, ?, 'owner')
    `);

    const transaction = this.db.transaction(() => {
      insertProject.run(id, name, description, ownerId, now, now);
      insertMember.run(id, ownerId);
    });

    transaction();

    return {
      id,
      name,
      description,
      ownerId,
      createdAt: now,
      updatedAt: now,
    };
  }

  listUserProjects(userId: string, page: number = 1, pageSize: number = 20): PaginatedResult<Project> {
    pageSize = Math.min(Math.max(pageSize, 1), 100);
    page = Math.max(page, 1);
    const offset = (page - 1) * pageSize;

    const countRow = this.db.prepare(`
      SELECT COUNT(DISTINCT p.id) as total
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
    `).get(userId) as { total: number };

    const rows = this.db.prepare(`
      SELECT DISTINCT p.*
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, pageSize, offset) as ProjectRow[];

    const total = countRow.total;
    return {
      items: rows.map(toProject),
      total,
      page,
      pageSize,
      hasMore: offset + rows.length < total,
    };
  }

  getProjectById(id: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!row) {
      throw new NotFoundError('Project not found');
    }
    return toProject(row);
  }

  updateProject(id: string, userId: string, updates: { name?: string; description?: string }): Project {
    const project = this.getProjectById(id);
    this.ensureOwner(id, userId);

    const name = updates.name ?? project.name;
    const description = updates.description ?? project.description;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?
    `).run(name, description, now, id);

    return {
      ...project,
      name,
      description,
      updatedAt: now,
    };
  }

  deleteProject(id: string, userId: string): void {
    this.getProjectById(id);
    this.ensureOwner(id, userId);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  listMembers(projectId: string): { id: string; projectId: string; userId: string; role: string }[] {
    this.getProjectById(projectId);
    const rows = this.db.prepare(
      "SELECT project_id, user_id, role FROM project_members WHERE project_id = ? AND role != 'owner'"
    ).all(projectId) as { project_id: string; user_id: string; role: string }[];
    return rows.map((r) => ({
      id: r.user_id,
      projectId: r.project_id,
      userId: r.user_id,
      role: r.role,
    }));
  }

  updateMemberRole(projectId: string, userId: string, role: string, requesterId: string): { id: string; projectId: string; userId: string; role: string } {
    this.getProjectById(projectId);
    this.ensureOwner(projectId, requesterId);

    const existing = this.db.prepare(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, userId) as { project_id: string; user_id: string; role: string } | undefined;

    if (!existing) {
      throw new NotFoundError('Member not found');
    }

    this.db.prepare(
      'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?'
    ).run(role, projectId, userId);

    return { id: userId, projectId, userId, role };
  }

  addMember(projectId: string, userId: string, requesterId: string, role: string = 'member'): { id: string; projectId: string; userId: string; role: string } {
    this.getProjectById(projectId);
    this.ensureOwner(projectId, requesterId);

    const existing = this.db.prepare(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, userId);

    if (existing) {
      throw new ForbiddenError('User is already a member of this project');
    }

    const validRole = ['member', 'viewer'].includes(role) ? role : 'member';
    this.db.prepare(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
    ).run(projectId, userId, validRole);

    return { id: userId, projectId, userId, role: validRole };
  }

  removeMember(projectId: string, userId: string, requesterId: string): void {
    this.getProjectById(projectId);
    this.ensureOwner(projectId, requesterId);

    if (userId === requesterId) {
      throw new ForbiddenError('Cannot remove yourself as owner');
    }

    const result = this.db.prepare(
      'DELETE FROM project_members WHERE project_id = ? AND user_id = ?'
    ).run(projectId, userId);

    if (result.changes === 0) {
      throw new NotFoundError('Member not found');
    }
  }

  isMember(projectId: string, userId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, userId);
    return !!row;
  }

  isOwner(projectId: string, userId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM projects WHERE id = ? AND owner_id = ?'
    ).get(projectId, userId);
    return !!row;
  }

  private ensureOwner(projectId: string, userId: string): void {
    if (!this.isOwner(projectId, userId)) {
      throw new ForbiddenError('Only the project owner can perform this action');
    }
  }
}
