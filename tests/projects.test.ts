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

describe('Projects API', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    app = createApp({ db });
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
    });
  });

  describe('POST /projects', () => {
    it('creates a project and sets user as owner', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ name: 'Test Project', description: 'A test project' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Project');
      expect(res.body.data.description).toBe('A test project');
      expect(res.body.data.ownerId).toBe('user1');
      expect(res.body.data.id).toBeDefined();
    });

    it('returns 401 without auth headers', async () => {
      const res = await request(app)
        .post('/projects')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });

    it('returns 400 without name', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ description: 'No name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('returns 400 with empty name', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 with name exceeding max length', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ name: 'a'.repeat(201) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('defaults description to empty string', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ name: 'No Desc' });

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('');
    });
  });

  describe('GET /projects', () => {
    it('lists only projects user is a member of', async () => {
      // Create project as user1
      await request(app)
        .post('/projects')
        .set(authHeaders('user1'))
        .send({ name: 'Project 1' });

      // Create project as user2
      await request(app)
        .post('/projects')
        .set(authHeaders('user2', 'user2@test.com'))
        .send({ name: 'Project 2' });

      // user1 should only see their project
      const res = await request(app)
        .get('/projects')
        .set(authHeaders('user1'));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Project 1');
      expect(res.body.data.total).toBe(1);
    });

    it('supports pagination', async () => {
      // Create 3 projects
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/projects')
          .set(authHeaders())
          .send({ name: `Project ${i}` });
      }

      const res = await request(app)
        .get('/projects?page=1&pageSize=2')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.hasMore).toBe(true);
    });
  });

  describe('GET /projects/:id', () => {
    it('returns project details', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders())
        .send({ name: 'My Project' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .get(`/projects/${projectId}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('My Project');
    });

    it('returns 404 for nonexistent project', async () => {
      const res = await request(app)
        .get('/projects/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /projects/:id', () => {
    it('allows owner to update project', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Original' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/projects/${projectId}`)
        .set(authHeaders('owner1'))
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('rejects non-owner update with 403', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Original' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/projects/${projectId}`)
        .set(authHeaders('other-user', 'other@test.com'))
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /projects/:id', () => {
    it('allows owner to delete project', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'To Delete' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/projects/${projectId}`)
        .set(authHeaders('owner1'));

      expect(res.status).toBe(204);

      // Verify it's gone
      const getRes = await request(app)
        .get(`/projects/${projectId}`)
        .set(authHeaders('owner1'));

      expect(getRes.status).toBe(404);
    });

    it('rejects non-owner delete with 403', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Protected' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/projects/${projectId}`)
        .set(authHeaders('attacker', 'attacker@test.com'));

      expect(res.status).toBe(403);
    });
  });

  describe('POST /projects/:id/members', () => {
    it('allows owner to add a member', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Team Project' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .post(`/projects/${projectId}/members`)
        .set(authHeaders('owner1'))
        .send({ userId: 'member1' });

      expect(res.status).toBe(201);

      // member1 should now see the project
      const listRes = await request(app)
        .get('/projects')
        .set(authHeaders('member1', 'member1@test.com'));

      expect(listRes.body.data.items).toHaveLength(1);
    });

    it('rejects non-owner adding member with 403', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Team Project' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .post(`/projects/${projectId}/members`)
        .set(authHeaders('random-user', 'random@test.com'))
        .send({ userId: 'someone' });

      expect(res.status).toBe(403);
    });

    it('rejects adding duplicate member', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Team Project' });

      const projectId = createRes.body.data.id;

      await request(app)
        .post(`/projects/${projectId}/members`)
        .set(authHeaders('owner1'))
        .send({ userId: 'member1' });

      const res = await request(app)
        .post(`/projects/${projectId}/members`)
        .set(authHeaders('owner1'))
        .send({ userId: 'member1' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /projects/:id/members/:userId', () => {
    it('allows owner to remove a member', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'Team Project' });

      const projectId = createRes.body.data.id;

      await request(app)
        .post(`/projects/${projectId}/members`)
        .set(authHeaders('owner1'))
        .send({ userId: 'member1' });

      const res = await request(app)
        .delete(`/projects/${projectId}/members/member1`)
        .set(authHeaders('owner1'));

      expect(res.status).toBe(204);

      // member1 should no longer see the project
      const listRes = await request(app)
        .get('/projects')
        .set(authHeaders('member1', 'member1@test.com'));

      expect(listRes.body.data.items).toHaveLength(0);
    });

    it('prevents owner from removing themselves', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders('owner1'))
        .send({ name: 'My Project' });

      const projectId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/projects/${projectId}/members/owner1`)
        .set(authHeaders('owner1'));

      expect(res.status).toBe(403);
    });
  });
});
