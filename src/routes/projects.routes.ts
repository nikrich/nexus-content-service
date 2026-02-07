import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { ProjectService } from '../services/project.service.js';
import { ValidationError } from '../middleware/error.middleware.js';

const router = Router();

function getProjectService(req: Request): ProjectService {
  const db = req.app.get('db');
  return new ProjectService(db);
}

// POST /projects - Create project
router.post('/projects', authMiddleware, (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!name || typeof name !== 'string') {
    throw new ValidationError('Name is required');
  }

  const service = getProjectService(req);
  const project = service.createProject(
    name,
    description || '',
    req.user!.userId
  );

  res.status(201).json({ success: true, data: project });
});

// GET /projects - List user's projects (paginated)
router.get('/projects', authMiddleware, (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const service = getProjectService(req);
  const result = service.listUserProjects(req.user!.userId, page, pageSize);

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
  const { name, description } = req.body;
  const service = getProjectService(req);
  const project = service.updateProject(req.params.id, req.user!.userId, { name, description });

  res.json({ success: true, data: project });
});

// DELETE /projects/:id - Delete project (owner only)
router.delete('/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  service.deleteProject(req.params.id, req.user!.userId);

  res.status(204).send();
});

// POST /projects/:id/members - Add member (owner only)
router.post('/projects/:id/members', authMiddleware, (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'string') {
    throw new ValidationError('userId is required');
  }

  const service = getProjectService(req);
  service.addMember(req.params.id, userId, req.user!.userId);

  res.status(201).json({ success: true, data: { message: 'Member added' } });
});

// DELETE /projects/:id/members/:userId - Remove member (owner only)
router.delete('/projects/:id/members/:userId', authMiddleware, (req: Request, res: Response) => {
  const service = getProjectService(req);
  service.removeMember(req.params.id, req.params.userId, req.user!.userId);

  res.status(204).send();
});

export default router;
