import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { TaskService } from '../services/task.service.js';
import { ValidationError } from '../middleware/error.middleware.js';

const router = Router();

function getTaskService(req: Request): TaskService {
  const db = req.app.get('db');
  return new TaskService(db);
}

// POST /projects/:projectId/tasks - Create task (member)
router.post('/projects/:projectId/tasks', authMiddleware, (req: Request, res: Response) => {
  const { title, description, priority, assigneeId, dueDate, tags } = req.body;

  if (!title || typeof title !== 'string') {
    throw new ValidationError('Title is required');
  }

  const service = getTaskService(req);
  const task = service.createTask(req.params.projectId, req.user!.userId, {
    title,
    description,
    priority,
    assigneeId,
    dueDate,
    tags,
  });

  res.status(201).json({ success: true, data: task });
});

// GET /projects/:projectId/tasks - List tasks (with filtering, sorting, pagination)
router.get('/projects/:projectId/tasks', authMiddleware, (req: Request, res: Response) => {
  const service = getTaskService(req);
  const result = service.listTasks(req.params.projectId, req.user!.userId, {
    status: req.query.status as string | undefined,
    priority: req.query.priority as string | undefined,
    assigneeId: req.query.assigneeId as string | undefined,
    search: req.query.search as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: req.query.sortOrder as string | undefined,
    page: parseInt(req.query.page as string) || undefined,
    pageSize: parseInt(req.query.pageSize as string) || undefined,
  });

  res.json({ success: true, data: result });
});

// GET /tasks/:id - Get task details
router.get('/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getTaskService(req);
  const task = service.getTaskById(req.params.id);

  res.json({ success: true, data: task });
});

// PATCH /tasks/:id - Update task (member)
router.patch('/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const { title, description, status, priority, assigneeId, dueDate, tags } = req.body;
  const service = getTaskService(req);
  const task = service.updateTask(req.params.id, req.user!.userId, {
    title,
    description,
    status,
    priority,
    assigneeId,
    dueDate,
    tags,
  });

  res.json({ success: true, data: task });
});

// DELETE /tasks/:id - Delete task (owner/creator only)
router.delete('/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getTaskService(req);
  service.deleteTask(req.params.id, req.user!.userId);

  res.status(204).send();
});

export default router;
