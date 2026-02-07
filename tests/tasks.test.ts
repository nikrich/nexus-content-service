import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/server.js';
import { initializeDatabase } from '../src/db/schema.js';

function authHeaders(userId = 'user1', email = 'user1@test.com', role = 'member') {
  return {
    'X-User-Id': userId,
    'X-User-Email': email,
    'X-User-Role': role,
  };
}

describe('Tasks API', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let projectId: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    initializeDatabase(db);
    app = createApp({ db });

    // Create a project and add user2 as member
    const res = await request(app)
      .post('/projects')
      .set(authHeaders('user1'))
      .send({ name: 'Test Project' });

    projectId = res.body.data.id;

    await request(app)
      .post(`/projects/${projectId}/members`)
      .set(authHeaders('user1'))
      .send({ userId: 'user2' });
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('creates a task as project member', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'First Task', description: 'Do something', priority: 'high' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('First Task');
      expect(res.body.data.status).toBe('todo');
      expect(res.body.data.priority).toBe('high');
      expect(res.body.data.createdBy).toBe('user1');
      expect(res.body.data.projectId).toBe(projectId);
    });

    it('creates a task with tags', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Tagged Task', tags: ['bug', 'frontend'] });

      expect(res.status).toBe(201);
      expect(res.body.data.tags).toEqual(['bug', 'frontend']);
    });

    it('creates a task with assignee and due date', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Assigned', assigneeId: 'user2', dueDate: '2026-03-01T00:00:00Z' });

      expect(res.status).toBe(201);
      expect(res.body.data.assigneeId).toBe('user2');
      expect(res.body.data.dueDate).toBe('2026-03-01T00:00:00Z');
    });

    it('rejects task creation by non-member', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('outsider', 'outsider@test.com'))
        .send({ title: 'Sneaky task' });

      expect(res.status).toBe(403);
    });

    it('rejects task without title', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ description: 'No title' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /projects/:projectId/tasks', () => {
    beforeEach(async () => {
      // Create tasks with varying properties
      const tasks = [
        { title: 'Bug fix login', priority: 'critical', assigneeId: 'user1' },
        { title: 'Add dark mode', priority: 'low', assigneeId: 'user2' },
        { title: 'Update docs', priority: 'medium' },
        { title: 'Fix search bug', priority: 'high', assigneeId: 'user1' },
        { title: 'Refactor API', priority: 'medium', assigneeId: 'user2' },
      ];

      for (const task of tasks) {
        await request(app)
          .post(`/projects/${projectId}/tasks`)
          .set(authHeaders('user1'))
          .send(task);
      }

      // Update some tasks to different statuses
      const listRes = await request(app)
        .get(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'));

      const allTasks = listRes.body.data.items;
      // Set first task to in_progress
      await request(app)
        .patch(`/tasks/${allTasks[0].id}`)
        .set(authHeaders('user1'))
        .send({ status: 'in_progress' });
      // Set second task to done
      await request(app)
        .patch(`/tasks/${allTasks[1].id}`)
        .set(authHeaders('user1'))
        .send({ status: 'done' });
    });

    it('lists all tasks for project', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(5);
      expect(res.body.data.total).toBe(5);
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?status=todo`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.status === 'todo')).toBe(true);
    });

    it('filters by multiple statuses', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?status=todo,in_progress`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => ['todo', 'in_progress'].includes(t.status))).toBe(true);
    });

    it('filters by priority', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?priority=high,critical`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => ['high', 'critical'].includes(t.priority))).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('filters by assigneeId', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?assigneeId=user1`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.assigneeId === 'user1')).toBe(true);
    });

    it('searches by title', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?search=bug`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items.every((t: any) =>
        t.title.toLowerCase().includes('bug') || t.description.toLowerCase().includes('bug')
      )).toBe(true);
    });

    it('sorts by priority ascending', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?sortBy=priority&sortOrder=asc`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      const priorities = res.body.data.items.map((t: any) => t.priority);
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i] as keyof typeof order]).toBeGreaterThanOrEqual(
          order[priorities[i - 1] as keyof typeof order]
        );
      }
    });

    it('sorts by priority descending', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?sortBy=priority&sortOrder=desc`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      const priorities = res.body.data.items.map((t: any) => t.priority);
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i] as keyof typeof order]).toBeLessThanOrEqual(
          order[priorities[i - 1] as keyof typeof order]
        );
      }
    });

    it('paginates results', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks?page=1&pageSize=2`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(5);
      expect(res.body.data.hasMore).toBe(true);

      const page2 = await request(app)
        .get(`/projects/${projectId}/tasks?page=2&pageSize=2`)
        .set(authHeaders('user1'));

      expect(page2.body.data.items).toHaveLength(2);
      expect(page2.body.data.hasMore).toBe(true);
    });

    it('rejects listing by non-member', async () => {
      const res = await request(app)
        .get(`/projects/${projectId}/tasks`)
        .set(authHeaders('outsider', 'outsider@test.com'));

      expect(res.status).toBe(403);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns task details', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Detail Task', tags: ['test'] });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .get(`/tasks/${taskId}`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Detail Task');
      expect(res.body.data.tags).toEqual(['test']);
    });

    it('returns 404 for nonexistent task', async () => {
      const res = await request(app)
        .get('/tasks/nonexistent')
        .set(authHeaders('user1'));

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('allows member to update task', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Original' });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/tasks/${taskId}`)
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ title: 'Updated', status: 'in_progress', priority: 'high' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated');
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.priority).toBe('high');
    });

    it('allows setting assignee to null', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Assigned', assigneeId: 'user2' });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/tasks/${taskId}`)
        .set(authHeaders('user1'))
        .send({ assigneeId: null });

      expect(res.status).toBe(200);
      expect(res.body.data.assigneeId).toBeNull();
    });

    it('allows updating tags', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Tagged', tags: ['old'] });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/tasks/${taskId}`)
        .set(authHeaders('user1'))
        .send({ tags: ['new', 'updated'] });

      expect(res.status).toBe(200);
      expect(res.body.data.tags).toEqual(['new', 'updated']);
    });

    it('rejects update by non-member', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'Protected' });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/tasks/${taskId}`)
        .set(authHeaders('outsider', 'outsider@test.com'))
        .send({ title: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('allows task creator to delete', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ title: 'To Delete' });

      const taskId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/tasks/${taskId}`)
        .set(authHeaders('user2', 'user2@test.com'));

      expect(res.status).toBe(204);
    });

    it('allows project owner to delete any task', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ title: 'User2 Task' });

      const taskId = createRes.body.data.id;

      // user1 is the project owner
      const res = await request(app)
        .delete(`/tasks/${taskId}`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(204);
    });

    it('rejects delete by non-owner/non-creator member', async () => {
      const createRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set(authHeaders('user1'))
        .send({ title: 'User1 Task' });

      const taskId = createRes.body.data.id;

      // user2 is a member but not creator or project owner
      const res = await request(app)
        .delete(`/tasks/${taskId}`)
        .set(authHeaders('user2', 'user2@test.com'));

      expect(res.status).toBe(403);
    });
  });
});
