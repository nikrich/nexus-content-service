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

describe('Comments API', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    initializeDatabase(db);
    app = createApp({ db });

    // Create project
    const projRes = await request(app)
      .post('/projects')
      .set(authHeaders('user1'))
      .send({ name: 'Test Project' });
    projectId = projRes.body.data.id;

    // Add user2 as member
    await request(app)
      .post(`/projects/${projectId}/members`)
      .set(authHeaders('user1'))
      .send({ userId: 'user2' });

    // Create a task
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders('user1'))
      .send({ title: 'Test Task', assigneeId: 'user2' });
    taskId = taskRes.body.data.id;
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('creates a comment as project member', async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: 'This is a comment' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.body).toBe('This is a comment');
      expect(res.body.data.authorId).toBe('user1');
      expect(res.body.data.taskId).toBe(taskId);
    });

    it('rejects comment by non-member', async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('outsider', 'outsider@test.com'))
        .send({ body: 'Sneaky comment' });

      expect(res.status).toBe(403);
    });

    it('rejects comment without body', async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('rejects comment with empty body', async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects comment with body exceeding max length', async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: 'x'.repeat(5001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for nonexistent task', async () => {
      const res = await request(app)
        .post('/tasks/nonexistent/comments')
        .set(authHeaders('user1'))
        .send({ body: 'Comment on nothing' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /tasks/:taskId/comments', () => {
    it('lists comments in chronological order', async () => {
      await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: 'First comment' });

      await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ body: 'Second comment' });

      const res = await request(app)
        .get(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].body).toBe('First comment');
      expect(res.body.data[1].body).toBe('Second comment');
    });

    it('rejects listing by non-member', async () => {
      const res = await request(app)
        .get(`/tasks/${taskId}/comments`)
        .set(authHeaders('outsider', 'outsider@test.com'));

      expect(res.status).toBe(403);
    });

    it('returns 404 for nonexistent task', async () => {
      const res = await request(app)
        .get('/tasks/nonexistent/comments')
        .set(authHeaders('user1'));

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('allows author to delete their comment', async () => {
      const createRes = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: 'To be deleted' });

      const commentId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/comments/${commentId}`)
        .set(authHeaders('user1'));

      expect(res.status).toBe(204);

      // Verify it's gone
      const listRes = await request(app)
        .get(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'));

      expect(listRes.body.data).toHaveLength(0);
    });

    it('allows admin to delete any comment', async () => {
      const createRes = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ body: 'User2 comment' });

      const commentId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/comments/${commentId}`)
        .set(authHeaders('admin1', 'admin@test.com', 'admin'));

      expect(res.status).toBe(204);
    });

    it('rejects delete by non-author non-admin', async () => {
      const createRes = await request(app)
        .post(`/tasks/${taskId}/comments`)
        .set(authHeaders('user1'))
        .send({ body: 'Protected comment' });

      const commentId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/comments/${commentId}`)
        .set(authHeaders('user2', 'user2@test.com'));

      expect(res.status).toBe(403);
    });

    it('returns 404 for nonexistent comment', async () => {
      const res = await request(app)
        .delete('/comments/nonexistent')
        .set(authHeaders('user1'));

      expect(res.status).toBe(404);
    });
  });
});
