import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { TaskService } from '../services/task.service.js';
import {
  createTaskSchema,
  updateTaskSchema,
  taskFilterQuerySchema,
} from '../schemas/validation.js';

const router = Router();

function getTaskService(req: Request): TaskService {
  const db = req.app.get('db');
  return new TaskService(db);
}

// POST /projects/:projectId/tasks - Create task (member)
router.post('/projects/:projectId/tasks', authMiddleware, (req: Request, res: Response) => {
  const data = validateBody(createTaskSchema, req.body);

  const service = getTaskService(req);
  const task = service.createTask(req.params.projectId, req.user!.userId, data);

  res.status(201).json({ success: true, data: task });
});

// GET /projects/:projectId/tasks - List tasks (with filtering, sorting, pagination)
router.get('/projects/:projectId/tasks', authMiddleware, (req: Request, res: Response) => {
  const filters = validateQuery(taskFilterQuerySchema, req.query);

  const service = getTaskService(req);
  const result = service.listTasks(req.params.projectId, req.user!.userId, filters);

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
  const data = validateBody(updateTaskSchema, req.body);

  const service = getTaskService(req);
  const task = service.updateTask(req.params.id, req.user!.userId, data);

  res.json({ success: true, data: task });
});

// DELETE /tasks/:id - Delete task (owner/creator only)
router.delete('/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getTaskService(req);
  service.deleteTask(req.params.id, req.user!.userId);

  res.status(204).send();
});

export default router;
