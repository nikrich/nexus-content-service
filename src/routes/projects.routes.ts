import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { ProjectService } from '../services/project.service.js';
import {
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  paginationQuerySchema,
} from '../schemas/validation.js';

const router = Router();

function getProjectService(req: Request): ProjectService {
  const db = req.app.get('db');
  return new ProjectService(db);
}

// POST /projects - Create project
router.post('/projects', authMiddleware, (req: Request, res: Response) => {
  const data = validateBody(createProjectSchema, req.body);

  const service = getProjectService(req);
  const project = service.createProject(
    data.name,
    data.description ?? '',
    req.user!.userId
  );

  res.status(201).json({ success: true, data: project });
});

// GET /projects - List user's projects (paginated)
router.get('/projects', authMiddleware, (req: Request, res: Response) => {
  const query = validateQuery(paginationQuerySchema, req.query);

  const service = getProjectService(req);
  const result = service.listUserProjects(req.user!.userId, query.page, query.pageSize);

  res.json({ success: true, data: result });
});

// GET /projects/:id - Get project details
router.get('/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  const project = service.getProjectById(req.params.id);

  res.json({ success: true, data: project });
});

// PATCH /projects/:id - Update project (owner only)
router.patch('/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const data = validateBody(updateProjectSchema, req.body);

  const service = getProjectService(req);
  const project = service.updateProject(req.params.id, req.user!.userId, data);

  res.json({ success: true, data: project });
});

// DELETE /projects/:id - Delete project (owner only)
router.delete('/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  service.deleteProject(req.params.id, req.user!.userId);

  res.status(204).send();
});

// GET /projects/:id/members - List project members
router.get('/projects/:id/members', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  const members = service.listMembers(req.params.id);

  res.json({ success: true, data: members });
});

// POST /projects/:id/members - Add member (owner only)
router.post('/projects/:id/members', authMiddleware, (req: Request, res: Response) => {
  const data = validateBody(addMemberSchema, req.body);

  const service = getProjectService(req);
  service.addMember(req.params.id, data.userId, req.user!.userId);

  res.status(201).json({ success: true, data: { message: 'Member added' } });
});

// PATCH /projects/:id/members/:userId - Update member role (owner only)
router.patch('/projects/:id/members/:userId', authMiddleware, (req: Request, res: Response) => {
  const { role } = req.body;

  const service = getProjectService(req);
  const member = service.updateMemberRole(req.params.id, req.params.userId, role, req.user!.userId);

  res.json({ success: true, data: member });
});

// DELETE /projects/:id/members/:userId - Remove member (owner only)
router.delete('/projects/:id/members/:userId', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  service.removeMember(req.params.id, req.params.userId, req.user!.userId);

  res.status(204).send();
});

export default router;
